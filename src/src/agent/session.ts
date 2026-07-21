import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { ControlFolder, Sample } from "../control/discover.js";
import type { DecisionLog } from "../audit/log.js";
import { RefRegistry } from "../audit/refs.js";
import {
  OpenEvidenceSchema,
  QueryDataSchema,
  RecordEvidenceSchema,
  SubmitAssessmentSchema,
  SubmitReviewSchema,
  SubmitTestPlanSchema,
  type EvidenceRef,
  type QualityReview,
  type SampleResult,
  type SubmitAssessment,
  type SubmitReview,
  type TestPlan,
} from "../audit/schema.js";
import { loadEvidence } from "../evidence/inventory.js";
import type { TableSheet } from "../evidence/types.js";
import type { ModelClient } from "../model/client.js";
import { buildSandboxTables, runAnalysis } from "./analysis.js";
import {
  renderPlanRequest,
  renderReviewRequest,
  renderSampleRequest,
  REVIEW_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from "./prompts.js";
import { decodeModelText } from "./sanitize.js";
import {
  digestContent,
  openEvidenceTool,
  queryDataTool,
  recordEvidenceTool,
  renderEvidenceContent,
  submitAssessmentTool,
  submitReviewTool,
  submitTestPlanTool,
} from "./tools.js";

const MAX_PLAN_TURNS = 6;
const MAX_SAMPLE_TURNS = 40;
const MAX_REVIEW_TURNS = 20;
const MAX_NUDGES = 2;

export interface SessionDeps {
  model: ModelClient;
  log: DecisionLog;
  progress: (message: string) => void;
}

export interface RunSampleOptions {
  /** Run the adversarial quality review after the assessment is accepted (default true). */
  qualityReview?: boolean;
}

interface ToolOutcome {
  content: string | Anthropic.ContentBlockParam[];
  isError: boolean;
}

interface UsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  modelCalls: number;
}

/** Phase 1: one plan per control, approved before any evidence is assessed. */
export async function planControl(
  deps: SessionDeps,
  control: ControlFolder,
  tableSheets: Map<string, TableSheet[]>
): Promise<TestPlan> {
  const { model, log, progress } = deps;
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: renderPlanRequest(control.name, control.documents, control.samples, tableSheets),
    },
  ];

  let nudges = 0;
  for (let turn = 1; turn <= MAX_PLAN_TURNS; turn++) {
    const reply = await model.call({
      system: SYSTEM_PROMPT,
      messages,
      tools: [submitTestPlanTool],
    });
    logModelCall(log, turn, reply);

    if (reply.stopReason === "tool_use") {
      messages.push({ role: "assistant", content: reply.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      let plan: TestPlan | null = null;

      for (const block of toolUses(reply.content)) {
        log.append({ type: "tool_call", turn, tool: block.name, input: block.input });
        const parsed = SubmitTestPlanSchema.safeParse(decodeModelText(block.input));
        const errors = parsed.success ? validatePlan(parsed.data) : zodIssues(parsed.error);
        if (parsed.success && errors.length === 0) {
          plan = parsed.data;
          results.push(toolResult(block.id, "Test plan accepted.", false));
          log.append({ type: "plan_submitted", plan });
        } else {
          results.push(toolResult(block.id, rejection(errors), true));
          log.append({ type: "validation_rejected", tool: block.name, errors });
        }
        log.append({
          type: "tool_result",
          turn,
          tool: block.name,
          ok: errors.length === 0,
          result: errors,
        });
      }
      if (plan) {
        progress(`test plan approved (${plan.attributes.length} attributes)`);
        return plan;
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    messages.push({ role: "assistant", content: reply.content });
    if (reply.stopReason === "pause_turn") continue;
    if (nudges++ < MAX_NUDGES) {
      messages.push({
        role: "user",
        content: "Submit the test plan now using the submit_test_plan tool.",
      });
      continue;
    }
    break;
  }
  throw new Error("model did not produce a valid test plan");
}

/**
 * The evidence toolkit shared by the engagement and the quality review:
 * open_evidence and query_data handlers bound to one sample, one citation
 * registry and one analysis-id space.
 */
function createExaminationTools(args: {
  sample: Sample;
  tableSheets: Map<string, TableSheet[]>;
  log: DecisionLog;
  progress: (message: string) => void;
  analysisPrefix: "Q" | "R";
}) {
  const { sample, tableSheets, log, progress, analysisPrefix } = args;

  const registry = new RefRegistry();
  const tableEntries: { evidenceId: string; sheets: TableSheet[] }[] = [];
  for (const file of sample.evidence) {
    registry.registerEvidence(file);
    const sheets = tableSheets.get(file.absPath);
    if (sheets) {
      registry.registerSheets(
        file.id,
        sheets.map((s) => s.name)
      );
      tableEntries.push({ evidenceId: file.id, sheets });
    }
  }
  const sandbox = buildSandboxTables(tableEntries);
  const opened = new Set<string>();
  let analysisCount = 0;

  const handlers: Record<string, (input: unknown) => Promise<ToolOutcome>> = {
    open_evidence: async (input) => {
      const { evidenceId } = OpenEvidenceSchema.parse(input);
      const file = sample.evidence.find((f) => f.id === evidenceId);
      if (!file) return err(`unknown evidence id '${evidenceId}'`);
      if (file.kind === "unsupported") return err(`${file.file} is not an openable evidence type`);
      if (opened.has(evidenceId)) {
        return {
          content: `${evidenceId} was already opened earlier in this session; its content is above.`,
          isError: false,
        };
      }
      const content = await loadEvidence(file);
      opened.add(evidenceId);
      registry.markOpened(evidenceId);
      if (content.kind === "image") registry.registerTiles(evidenceId, content.tiles.length);
      log.append({ type: "evidence_opened", evidenceId, digest: digestContent(content) });
      progress(`opened ${evidenceId} (${file.file})`);
      return { content: renderEvidenceContent(file, content), isError: false };
    },

    query_data: async (input) => {
      const { goal, code } = QueryDataSchema.parse(input);
      const outcome = runAnalysis(sandbox, code);
      const id = `${analysisPrefix}${++analysisCount}`;
      log.append({
        type: "analysis",
        id,
        goal,
        code,
        result: outcome.ok ? JSON.parse(outcome.resultJson ?? "null") : outcome.error,
        logs: outcome.logs,
      });
      if (!outcome.ok) {
        return err(
          `analysis failed: ${outcome.error}${outcome.logs.length ? `\nlogs:\n${outcome.logs.join("\n")}` : ""}`
        );
      }
      registry.registerAnalysis(id);
      progress(`analysis ${id}: ${goal}`);
      const truncated = outcome.truncated
        ? "\n[result truncated — narrow the query if you need the tail]"
        : "";
      const logs = outcome.logs.length ? `\nlogs:\n${outcome.logs.join("\n")}` : "";
      return {
        content: `analysis id: ${id}\ngoal: ${goal}\nresult: ${outcome.resultJson}${truncated}${logs}`,
        isError: false,
      };
    },
  };

  return { registry, handlers };
}

/** Drive one tool-use conversation until `isDone` reports completion. */
async function driveSession(args: {
  deps: SessionDeps;
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  handlers: Record<string, (input: unknown) => Promise<ToolOutcome>>;
  maxTurns: number;
  usage: UsageAccumulator;
  isDone: () => boolean;
  onToolCall?: () => void;
  nudge: string;
}): Promise<void> {
  const { deps, system, messages, tools, handlers, maxTurns, usage, isDone, onToolCall, nudge } =
    args;
  const { model, log } = deps;

  let nudges = 0;
  let maxTokenRetries = 0;
  for (let turn = 1; turn <= maxTurns; turn++) {
    const reply = await model.call({ system, messages, tools });
    usage.inputTokens += reply.usage.inputTokens;
    usage.outputTokens += reply.usage.outputTokens;
    usage.cacheReadTokens += reply.usage.cacheReadTokens;
    usage.cacheWriteTokens += reply.usage.cacheWriteTokens;
    usage.modelCalls += 1;
    logModelCall(log, turn, reply);

    if (reply.stopReason === "max_tokens") {
      if (maxTokenRetries++ >= 1) throw new Error("model hit max_tokens twice; aborting");
      continue; // drop the truncated turn and retry
    }

    messages.push({ role: "assistant", content: reply.content });

    if (reply.stopReason === "tool_use") {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUses(reply.content)) {
        onToolCall?.();
        log.append({ type: "tool_call", turn, tool: block.name, input: block.input });
        const handler = handlers[block.name];
        let outcome: ToolOutcome;
        try {
          outcome = handler ? await handler(block.input) : err(`unknown tool '${block.name}'`);
        } catch (toolError) {
          outcome = err(
            `tool failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`
          );
        }
        log.append({
          type: "tool_result",
          turn,
          tool: block.name,
          ok: !outcome.isError,
          result:
            typeof outcome.content === "string"
              ? outcome.content.slice(0, 2_000)
              : "(evidence content)",
        });
        results.push(toolResult(block.id, outcome.content, outcome.isError));
      }
      messages.push({ role: "user", content: results });
      if (isDone()) return;
      continue;
    }

    if (reply.stopReason === "pause_turn") continue;

    if (reply.stopReason === "refusal") {
      throw new Error("model refused the request (stop_reason=refusal)");
    }

    // end_turn without completing the session's goal
    if (isDone()) return;
    if (nudges++ < MAX_NUDGES) {
      messages.push({ role: "user", content: nudge });
      continue;
    }
    throw new Error("model ended the session without completing it");
  }
  throw new Error(`session did not complete within ${maxTurns} turns`);
}

/** The adversarial second pair of eyes: fresh context, same evidence. */
async function runQualityReview(args: {
  deps: SessionDeps;
  control: ControlFolder;
  plan: TestPlan;
  sample: Sample;
  tableSheets: Map<string, TableSheet[]>;
  assessment: SubmitAssessment;
  usage: UsageAccumulator;
  onToolCall: () => void;
}): Promise<SubmitReview> {
  const { deps, control, plan, sample, tableSheets, assessment, usage, onToolCall } = args;
  const { log, progress } = deps;

  log.append({ type: "quality_review_started", sample: sample.name });
  progress("quality review: examining the submitted assessment");

  const { registry, handlers } = createExaminationTools({
    sample,
    tableSheets,
    log,
    progress: (m) => progress(`review: ${m}`),
    analysisPrefix: "R",
  });

  const state: { review: SubmitReview | null } = { review: null };
  const planIds = plan.attributes.map((a) => a.id);

  handlers["submit_review"] = async (input) => {
    const parsed = SubmitReviewSchema.safeParse(decodeModelText(input));
    if (!parsed.success) return reject(log, "submit_review", zodIssues(parsed.error));
    const errors: string[] = [];
    for (const id of [
      ...parsed.data.confirmed,
      ...parsed.data.challenges.map((c) => c.attributeId),
    ]) {
      if (!planIds.includes(id)) errors.push(`'${id}' is not an attribute in the plan`);
    }
    for (const challenge of parsed.data.challenges) {
      errors.push(...registry.validateAll(challenge.evidence).map((e) => `challenge: ${e}`));
    }
    const covered = new Set([
      ...parsed.data.confirmed,
      ...parsed.data.challenges.map((c) => c.attributeId),
    ]);
    for (const id of planIds) {
      if (!covered.has(id)) errors.push(`attribute ${id} is neither confirmed nor challenged`);
    }
    if (errors.length > 0) return reject(log, "submit_review", errors);
    state.review = parsed.data;
    log.append({ type: "review_submitted", review: parsed.data });
    return { content: "Review recorded.", isError: false };
  };

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: renderReviewRequest(
        control.name,
        control.documents,
        plan,
        sample,
        tableSheets,
        JSON.stringify(assessment, null, 2)
      ),
    },
  ];

  await driveSession({
    deps,
    system: REVIEW_SYSTEM_PROMPT,
    messages,
    tools: [openEvidenceTool, queryDataTool, submitReviewTool],
    handlers,
    maxTurns: MAX_REVIEW_TURNS,
    usage,
    isDone: () => state.review !== null,
    onToolCall,
    nudge: "Conclude the review now using the submit_review tool.",
  });

  if (!state.review) throw new Error("quality review ended without a submitted review");
  return state.review;
}

/** Phases 2-3 for one sample: examine evidence, conclude, survive review. */
export async function runSample(
  deps: SessionDeps,
  control: ControlFolder,
  plan: TestPlan,
  sample: Sample,
  tableSheets: Map<string, TableSheet[]>,
  options: RunSampleOptions = {}
): Promise<SampleResult> {
  const { log, progress } = deps;
  const startedAt = Date.now();
  const usage: UsageAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    modelCalls: 0,
  };
  let toolCalls = 0;

  const finish = (
    status: SampleResult["status"],
    assessment: SubmitAssessment | null,
    qualityReview: QualityReview | null,
    error: string | null
  ): SampleResult => {
    const durationMs = Date.now() - startedAt;
    log.append({ type: "sample_completed", sample: sample.name, status, durationMs });
    return {
      sample: sample.name,
      status,
      evidence: sample.evidence.map(({ id, file, sha256, mediaType, bytes, shared }) => ({
        id,
        file,
        sha256,
        mediaType,
        bytes,
        shared,
      })),
      assessment,
      qualityReview,
      error,
      usage,
      toolCalls,
      durationMs,
    };
  };

  try {
    const { registry, handlers } = createExaminationTools({
      sample,
      tableSheets,
      log,
      progress,
      analysisPrefix: "Q",
    });
    log.append({
      type: "evidence_inventory",
      sample: sample.name,
      evidence: sample.evidence.map(({ id, file, sha256, mediaType, bytes, shared, kind }) => ({
        id,
        file,
        sha256,
        mediaType,
        bytes,
        shared,
        kind,
      })),
    });

    const state: { assessment: SubmitAssessment | null } = { assessment: null };

    handlers["record_evidence"] = async (input) => {
      const { notes } = RecordEvidenceSchema.parse(decodeModelText(input));
      const refs: EvidenceRef[] = notes.map((n) => ({
        source: n.source,
        locator: n.locator,
        observation: n.fact,
      }));
      const errors = registry.validateAll(refs);
      if (errors.length > 0) return err(rejection(errors));
      log.append({ type: "note_recorded", notes });
      return { content: `Recorded ${notes.length} note(s).`, isError: false };
    };

    handlers["submit_assessment"] = async (input) => {
      const parsed = SubmitAssessmentSchema.safeParse(decodeModelText(input));
      if (!parsed.success) return reject(log, "submit_assessment", zodIssues(parsed.error));
      const errors = validateAssessment(parsed.data, plan, registry);
      if (errors.length > 0) return reject(log, "submit_assessment", errors);
      state.assessment = parsed.data;
      log.append({ type: "assessment_submitted", assessment: parsed.data });
      return { content: "Assessment accepted.", isError: false };
    };

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: renderSampleRequest(control.name, control.documents, plan, sample, tableSheets),
      },
    ];
    const tools = [openEvidenceTool, queryDataTool, recordEvidenceTool, submitAssessmentTool];

    await driveSession({
      deps,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      handlers,
      maxTurns: MAX_SAMPLE_TURNS,
      usage,
      isDone: () => state.assessment !== null,
      onToolCall: () => toolCalls++,
      nudge:
        "The engagement is not complete: submit the assessment for every attribute in the " +
        "approved plan using the submit_assessment tool.",
    });
    const firstAssessment = state.assessment;
    if (!firstAssessment) throw new Error("engagement ended without an accepted assessment");
    progress("assessment accepted");

    if (options.qualityReview === false) {
      return finish("assessed", firstAssessment, null, null);
    }

    // Engagement quality review: a fresh session tries to break the
    // assessment; blocking challenges send it back for one revision round.
    const review = await runQualityReview({
      deps,
      control,
      plan,
      sample,
      tableSheets,
      assessment: firstAssessment,
      usage,
      onToolCall: () => toolCalls++,
    });
    const blocking = review.challenges.filter((c) => c.severity === "blocking");
    progress(
      `quality review: ${review.challenges.length} challenge(s), ${blocking.length} blocking`
    );

    if (blocking.length === 0) {
      return finish(
        "assessed",
        firstAssessment,
        { review, revised: false, resolution: null },
        null
      );
    }

    log.append({ type: "revision_requested", challenges: blocking });
    state.assessment = null;
    messages.push({
      role: "user",
      content:
        `An independent engagement quality review challenged the assessment. Blocking challenges:\n\n` +
        JSON.stringify(blocking, null, 2) +
        `\n\nAddress every blocking challenge: revise the affected conclusions, or keep them and ` +
        `strengthen the reasoning and citations so they withstand the challenge. Then resubmit the ` +
        `complete assessment with submit_assessment.`,
    });

    await driveSession({
      deps,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      handlers,
      maxTurns: 12,
      usage,
      isDone: () => state.assessment !== null,
      onToolCall: () => toolCalls++,
      nudge: "Resubmit the complete assessment with submit_assessment.",
    });
    progress("revised assessment accepted");

    const final = state.assessment ?? firstAssessment;
    return finish(
      "assessed",
      final,
      {
        review,
        revised: true,
        resolution: `Assessment revised in response to ${blocking.length} blocking challenge(s); see the revised reasoning above.`,
      },
      null
    );
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    log.append({ type: "error", message: messageText });
    progress(`ERROR: ${messageText}`);
    return finish("error", null, null, messageText);
  }
}

function validatePlan(plan: TestPlan): string[] {
  const errors: string[] = [];
  if (plan.attributes.length === 0) errors.push("plan has no attributes");
  const ids = new Set<string>();
  for (const attr of plan.attributes) {
    if (ids.has(attr.id)) errors.push(`duplicate attribute id '${attr.id}'`);
    ids.add(attr.id);
    if (attr.text.trim() === "") errors.push(`attribute ${attr.id} has empty text`);
    if (attr.procedures.length === 0) errors.push(`attribute ${attr.id} has no procedures`);
  }
  return errors;
}

function validateAssessment(
  assessment: SubmitAssessment,
  plan: TestPlan,
  registry: RefRegistry
): string[] {
  const errors: string[] = [];
  const planIds = plan.attributes.map((a) => a.id);
  const submitted = assessment.attributes.map((a) => a.attributeId);

  for (const id of planIds) {
    const count = submitted.filter((s) => s === id).length;
    if (count === 0) errors.push(`missing assessment for attribute ${id}`);
    if (count > 1)
      errors.push(`attribute ${id} assessed ${count} times — submit exactly one entry`);
  }
  for (const id of submitted) {
    if (!planIds.includes(id)) {
      errors.push(`attribute '${id}' is not in the approved plan (${planIds.join(", ")})`);
    }
  }

  for (const attr of assessment.attributes) {
    const where = `attribute ${attr.attributeId}`;
    if (attr.verdict === "FURTHER_EVIDENCE_REQUIRED" && attr.furtherEvidenceRequired.length === 0) {
      errors.push(`${where}: FURTHER_EVIDENCE_REQUIRED needs at least one evidence request`);
    }
    if (attr.verdict !== "FURTHER_EVIDENCE_REQUIRED" && attr.furtherEvidenceRequired.length > 0) {
      errors.push(`${where}: evidence requests are only valid with FURTHER_EVIDENCE_REQUIRED`);
    }
    if (attr.verdict === "FAIL" && attr.exceptions.length === 0) {
      errors.push(`${where}: FAIL requires at least one exception`);
    }
    if (attr.verdict !== "FURTHER_EVIDENCE_REQUIRED" && attr.evidence.length === 0) {
      errors.push(`${where}: ${attr.verdict} requires at least one evidence citation`);
    }
    errors.push(...registry.validateAll(attr.evidence).map((e) => `${where}: ${e}`));
    for (const exception of attr.exceptions) {
      errors.push(
        ...registry.validateAll(exception.evidence).map((e) => `${where} exception: ${e}`)
      );
    }
  }
  for (const observation of assessment.observations) {
    errors.push(...registry.validateAll(observation.evidence).map((e) => `observation: ${e}`));
  }
  return errors;
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

function reject(log: DecisionLog, tool: string, errors: string[]): ToolOutcome {
  log.append({ type: "validation_rejected", tool, errors });
  return err(rejection(errors));
}

function rejection(errors: string[]): string {
  return `Submission rejected — fix these and resubmit:\n${errors.map((e) => `- ${e}`).join("\n")}`;
}

function err(message: string): ToolOutcome {
  return { content: message, isError: true };
}

function toolUses(content: Anthropic.ContentBlock[]): Anthropic.ToolUseBlock[] {
  return content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
}

function toolResult(
  toolUseId: string,
  content: string | Anthropic.ContentBlockParam[],
  isError: boolean
): Anthropic.ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content:
      typeof content === "string"
        ? content
        : (content as Anthropic.ToolResultBlockParam["content"]),
    is_error: isError,
  };
}

function logModelCall(
  log: DecisionLog,
  turn: number,
  reply: {
    stopReason: string | null;
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
    };
    thinkingSummary: string | null;
    text: string | null;
  }
): void {
  log.append({
    type: "model_call",
    turn,
    stopReason: reply.stopReason,
    inputTokens: reply.usage.inputTokens,
    outputTokens: reply.usage.outputTokens,
    cacheReadTokens: reply.usage.cacheReadTokens,
    cacheWriteTokens: reply.usage.cacheWriteTokens,
    thinkingSummary: reply.thinkingSummary,
    text: reply.text,
  });
}
