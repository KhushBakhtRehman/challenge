import { describe, expect, it } from "vitest";
import type { RunReport } from "../src/audit/schema.js";
import { gradeReport, type ControlExpectation } from "../src/eval/grade.js";

function report(verdict: "SUCCESS" | "FAIL", reasoning: string): RunReport {
  return {
    tool: { name: "attest", version: "1.0.0" },
    run: {
      id: "r",
      startedAt: "",
      finishedAt: "",
      model: "m",
      effort: "high",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        modelCalls: 0,
      },
    },
    control: {
      name: "c",
      folder: "/c",
      documents: [],
      testPlan: {
        controlSummary: "s",
        attributes: [
          {
            id: "A1",
            text: "Access reviews are performed periodically",
            interpretation: "i",
            procedures: ["p"],
          },
        ],
        evidenceConsiderations: "e",
      },
    },
    samples: [
      {
        sample: "sample-1",
        status: "assessed",
        evidence: [],
        qualityReview: null,
        assessment: {
          attributes: [
            {
              attributeId: "A1",
              verdict,
              confidence: "high",
              summary: "s",
              reasoning,
              evidence: [{ source: "E1", locator: null, observation: "o" }],
              exceptions:
                verdict === "FAIL"
                  ? [
                      {
                        title: "t",
                        detail: "kevin.lewis retained access",
                        severity: "high",
                        evidence: [],
                      },
                    ]
                  : [],
              furtherEvidenceRequired: [],
            },
          ],
          reperformance: [],
          observations: [],
          conclusion: "done",
        },
        error: null,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          modelCalls: 0,
        },
        toolCalls: 0,
        durationMs: 0,
      },
    ],
    summary: {
      verdicts: { "sample-1": { A1: verdict } },
      exceptionCount: 0,
      evidenceRequestCount: 0,
    },
  };
}

const expectation: ControlExpectation = {
  control: "c",
  attributes: [
    {
      match: "periodic",
      samples: {
        "sample-1": {
          accept: ["FAIL", "FURTHER_EVIDENCE_REQUIRED"],
          preferred: "FAIL",
          mustMention: ["kevin\\.lewis"],
          shouldMention: ["Q2 2026"],
        },
      },
    },
  ],
  sampleChecks: { "sample-1": { mustMention: ["kevin\\.lewis"] } },
};

describe("gradeReport", () => {
  it("scores acceptable + strict verdicts and finds mentions anywhere in the assessment", () => {
    const grade = gradeReport(report("FAIL", "reperformed; see exception"), expectation);
    expect(grade.totals).toEqual({
      verdictsAcceptable: 1,
      verdictsStrict: 1,
      verdictsTotal: 1,
      requiredMentionsFound: 2,
      requiredMentionsTotal: 2,
    });
    expect(grade.attributes[0]?.mentions.find((m) => m.pattern === "Q2 2026")?.found).toBe(false);
  });

  it("marks unacceptable verdicts and missing mentions", () => {
    const grade = gradeReport(report("SUCCESS", "all good"), expectation);
    expect(grade.totals.verdictsAcceptable).toBe(0);
    expect(grade.totals.requiredMentionsFound).toBe(0);
  });

  it("reports expectations that match no plan attribute", () => {
    const grade = gradeReport(report("FAIL", "x"), {
      control: "c",
      attributes: [{ match: "no-such-attribute", samples: {} }],
    });
    expect(grade.unmatchedExpectations).toEqual(["no-such-attribute"]);
  });
});
