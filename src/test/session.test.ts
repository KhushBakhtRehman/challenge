import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { planControl, runSample } from "../src/agent/session.js";
import { DecisionLog } from "../src/audit/log.js";
import { discoverControl } from "../src/control/discover.js";
import { loadEvidence } from "../src/evidence/inventory.js";
import type { TableSheet } from "../src/evidence/types.js";
import type { ModelClient, ModelTurn } from "../src/model/client.js";

/** A scripted stand-in for the model: yields queued turns, records requests. */
function fakeModel(turns: Partial<ModelTurn>[]): ModelClient {
  let i = 0;
  return {
    model: "fake",
    totals: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      modelCalls: 0,
    },
    call: async (): Promise<ModelTurn> => {
      const turn = turns[i++];
      if (!turn) throw new Error("fake model ran out of scripted turns");
      return {
        content: [],
        stopReason: "tool_use",
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
        thinkingSummary: null,
        text: null,
        ...turn,
      };
    },
  } as unknown as ModelClient;
}

function toolUse(
  name: string,
  input: unknown,
  id = `tu_${Math.random().toString(36).slice(2)}`
): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}

function makeControlDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "attest-session-"));
  writeFileSync(
    join(dir, "control.md"),
    "# Sample Control\n\n## Control Attributes\n* Records are approved\n"
  );
  writeFileSync(join(dir, "log.csv"), "id,approved,approver\nCHG-1,Yes,ann\nCHG-2,No,\n");
  return dir;
}

const PLAN = {
  controlSummary: "Records must be approved.",
  attributes: [
    {
      id: "A1",
      text: "Records are approved",
      interpretation: "Every record shows an approval",
      procedures: ["Inspect the log for approval on every record"],
    },
  ],
  evidenceConsiderations: "Single system export; no independent corroboration available.",
};

async function sheetsFor(dir: string): Promise<Map<string, TableSheet[]>> {
  const control = discoverControl(dir);
  const sheets = new Map<string, TableSheet[]>();
  for (const file of control.samples[0]?.evidence ?? []) {
    const content = await loadEvidence(file);
    if (content.kind === "table") sheets.set(file.absPath, content.sheets);
  }
  return sheets;
}

function assessment(overrides: object = {}) {
  return {
    attributes: [
      {
        attributeId: "A1",
        verdict: "FAIL",
        confidence: "high",
        summary: "1 of 2 records lacks approval.",
        reasoning: "Reperformed over the full population [Q1]; CHG-2 has no approver.",
        evidence: [{ source: "Q1", locator: null, observation: "1 unapproved record: CHG-2" }],
        exceptions: [
          {
            title: "Unapproved record",
            detail: "CHG-2 has approved=No and no approver.",
            severity: "high",
            evidence: [{ source: "E1", locator: "sheet:data!2", observation: "approved=No" }],
          },
        ],
        furtherEvidenceRequired: [],
      },
    ],
    reperformance: [],
    observations: [],
    conclusion: "Control not operating for this sample.",
    ...overrides,
  };
}

describe("planControl", () => {
  it("accepts a valid plan and rejects an invalid one first", async () => {
    const dir = makeControlDir();
    const control = discoverControl(dir);
    const log = new DecisionLog(join(dir, "log.jsonl"));
    const model = fakeModel([
      { content: [toolUse("submit_test_plan", { ...PLAN, attributes: [] })] },
      { content: [toolUse("submit_test_plan", PLAN)] },
    ]);

    const plan = await planControl(
      { model, log, progress: () => {} },
      control,
      await sheetsFor(dir)
    );
    expect(plan.attributes).toHaveLength(1);

    const events = readFileSync(join(dir, "log.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(events.some((e) => e.type === "validation_rejected")).toBe(true);
    expect(events.some((e) => e.type === "plan_submitted")).toBe(true);
  });
});

describe("runSample", () => {
  it("runs examine -> invalid submission -> corrected submission", async () => {
    const dir = makeControlDir();
    const control = discoverControl(dir);
    const sample = control.samples[0]!;
    const tableSheets = await sheetsFor(dir);
    const log = new DecisionLog(join(dir, "sample.jsonl"));

    const model = fakeModel([
      {
        content: [
          toolUse("open_evidence", { evidenceId: "E1" }),
          toolUse("query_data", {
            goal: "count unapproved records",
            code: "tables.E1.data.records.filter(r => r.approved !== 'Yes').map(r => r.id)",
          }),
        ],
      },
      // cites a sheet that does not exist -> must bounce
      {
        content: [
          toolUse(
            "submit_assessment",
            assessment({
              observations: [
                {
                  title: "bad ref",
                  detail: "cites missing sheet",
                  evidence: [{ source: "E1", locator: "sheet:Nope", observation: "x" }],
                },
              ],
            })
          ),
        ],
      },
      { content: [toolUse("submit_assessment", assessment())] },
    ]);

    const result = await runSample(
      { model, log, progress: () => {} },
      control,
      PLAN,
      sample,
      tableSheets,
      { qualityReview: false }
    );

    expect(result.status).toBe("assessed");
    expect(result.assessment?.attributes[0]?.verdict).toBe("FAIL");
    expect(result.usage.modelCalls).toBe(3);

    const events = readFileSync(join(dir, "sample.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const rejected = events.find((e) => e.type === "validation_rejected");
    expect(rejected?.errors?.[0]).toMatch(/does not exist in E1/);
    const analysis = events.find((e) => e.type === "analysis");
    expect(analysis?.result).toEqual(["CHG-2"]);
    expect(events.some((e) => e.type === "assessment_submitted")).toBe(true);
  });

  it("enforces FAIL-requires-exception and plan coverage", async () => {
    const dir = makeControlDir();
    const control = discoverControl(dir);
    const sample = control.samples[0]!;
    const log = new DecisionLog(join(dir, "sample2.jsonl"));

    // No query_data ran in this scenario, so cite the evidence file directly.
    const eRef = [{ source: "E1", locator: "sheet:data!2", observation: "approved=No" }];
    const bad = assessment({});
    (bad.attributes[0] as { exceptions: unknown[]; evidence: unknown[] }).exceptions = [];
    (bad.attributes[0] as { evidence: unknown[] }).evidence = eRef;
    const good = assessment({});
    (good.attributes[0] as { evidence: unknown[] }).evidence = eRef;
    const model = fakeModel([
      { content: [toolUse("submit_assessment", bad)] },
      { content: [toolUse("submit_assessment", good)] },
    ]);

    const result = await runSample(
      { model, log, progress: () => {} },
      control,
      PLAN,
      sample,
      await sheetsFor(dir),
      { qualityReview: false }
    );
    expect(result.status).toBe("assessed");

    const events = readFileSync(join(dir, "sample2.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const rejected = events.find((e) => e.type === "validation_rejected");
    expect(JSON.stringify(rejected?.errors)).toMatch(/FAIL requires at least one exception/);
  });

  it("contains sample failures instead of throwing", async () => {
    const dir = makeControlDir();
    const control = discoverControl(dir);
    const sample = control.samples[0]!;
    const log = new DecisionLog(join(dir, "sample3.jsonl"));
    const model = fakeModel([{ content: [], stopReason: "refusal" }]);

    const result = await runSample(
      { model, log, progress: () => {} },
      control,
      PLAN,
      sample,
      await sheetsFor(dir),
      { qualityReview: false }
    );
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/refus/);
  });

  it("runs the quality review; blocking challenges trigger one revision round", async () => {
    const dir = makeControlDir();
    const control = discoverControl(dir);
    const sample = control.samples[0]!;
    const log = new DecisionLog(join(dir, "review.jsonl"));

    const eRef = [{ source: "E1", locator: "sheet:data!2", observation: "approved=No" }];
    const initial = assessment({});
    (initial.attributes[0] as { evidence: unknown[] }).evidence = eRef;
    const revised = assessment({ conclusion: "Revised after review." });
    (revised.attributes[0] as { evidence: unknown[] }).evidence = eRef;

    const model = fakeModel([
      // engagement
      { content: [toolUse("submit_assessment", initial)] },
      // fresh review session: re-derives, then challenges
      {
        content: [
          toolUse("query_data", {
            goal: "re-derive unapproved count",
            code: "tables.E1.data.records.filter(r => r.approved !== 'Yes').length",
          }),
        ],
      },
      {
        content: [
          toolUse("submit_review", {
            confirmed: [],
            challenges: [
              {
                attributeId: "A1",
                severity: "blocking",
                challenge:
                  "Reasoning cites one record but does not address CHG-2's empty approver.",
                evidence: [{ source: "R1", locator: null, observation: "1 unapproved record" }],
              },
            ],
            summary: "One blocking challenge on A1.",
          }),
        ],
      },
      // engagement revises
      { content: [toolUse("submit_assessment", revised)] },
    ]);

    const result = await runSample(
      { model, log, progress: () => {} },
      control,
      PLAN,
      sample,
      await sheetsFor(dir)
    );

    expect(result.status).toBe("assessed");
    expect(result.qualityReview?.revised).toBe(true);
    expect(result.qualityReview?.review.challenges).toHaveLength(1);
    expect(result.assessment?.conclusion).toBe("Revised after review.");

    const events = readFileSync(join(dir, "review.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(events.some((e) => e.type === "quality_review_started")).toBe(true);
    expect(events.some((e) => e.type === "revision_requested")).toBe(true);
  });

  it("records a clean review without revision", async () => {
    const dir = makeControlDir();
    const control = discoverControl(dir);
    const sample = control.samples[0]!;
    const log = new DecisionLog(join(dir, "review2.jsonl"));

    const eRef = [{ source: "E1", locator: "sheet:data!2", observation: "approved=No" }];
    const initial = assessment({});
    (initial.attributes[0] as { evidence: unknown[] }).evidence = eRef;

    const model = fakeModel([
      { content: [toolUse("submit_assessment", initial)] },
      {
        content: [
          toolUse("submit_review", {
            confirmed: ["A1"],
            challenges: [],
            summary: "Assessment withstands review.",
          }),
        ],
      },
    ]);

    const result = await runSample(
      { model, log, progress: () => {} },
      control,
      PLAN,
      sample,
      await sheetsFor(dir)
    );

    expect(result.status).toBe("assessed");
    expect(result.qualityReview?.revised).toBe(false);
    expect(result.qualityReview?.review.confirmed).toEqual(["A1"]);
    expect(result.usage.modelCalls).toBe(2);
  });

  it("rejects reviews that skip attributes or cite unknown analyses", async () => {
    const dir = makeControlDir();
    const control = discoverControl(dir);
    const sample = control.samples[0]!;
    const log = new DecisionLog(join(dir, "review3.jsonl"));

    const eRef = [{ source: "E1", locator: "sheet:data!2", observation: "approved=No" }];
    const initial = assessment({});
    (initial.attributes[0] as { evidence: unknown[] }).evidence = eRef;

    const model = fakeModel([
      { content: [toolUse("submit_assessment", initial)] },
      // cites an engagement analysis id (Q1) it never derived, and covers no attribute
      {
        content: [
          toolUse("submit_review", {
            confirmed: [],
            challenges: [
              {
                attributeId: "A1",
                severity: "note",
                challenge: "x",
                evidence: [{ source: "Q1", locator: null, observation: "y" }],
              },
            ],
            summary: "s",
          }),
        ],
      },
      {
        content: [
          toolUse("submit_review", { confirmed: ["A1"], challenges: [], summary: "clean" }),
        ],
      },
    ]);

    const result = await runSample(
      { model, log, progress: () => {} },
      control,
      PLAN,
      sample,
      await sheetsFor(dir)
    );

    expect(result.status).toBe("assessed");
    const events = readFileSync(join(dir, "review3.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const rejected = events.filter((e) => e.type === "validation_rejected");
    expect(JSON.stringify(rejected)).toMatch(/does not exist/);
  });
});
