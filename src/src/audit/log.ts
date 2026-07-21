import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Append-only decision log: one JSONL file per sample session plus one for
 * control-level steps. Every model call, tool call, analysis, and validation
 * outcome lands here with a sequence number, so a reviewer can replay exactly
 * how each conclusion was formed.
 */

export type DecisionEvent =
  | { type: "run_started"; model: string; effort: string; control: string; argv: string[] }
  | { type: "control_docs_loaded"; documents: { file: string; sha256: string }[] }
  | { type: "evidence_inventory"; sample: string; evidence: object[] }
  | {
      type: "model_call";
      turn: number;
      stopReason: string | null;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheWriteTokens: number;
      thinkingSummary: string | null;
      text: string | null;
    }
  | { type: "tool_call"; turn: number; tool: string; input: unknown }
  | {
      type: "tool_result";
      turn: number;
      tool: string;
      ok: boolean;
      /** Full result for analyses/validation; digest for bulky evidence payloads. */
      result: unknown;
    }
  | { type: "analysis"; id: string; goal: string; code: string; result: unknown; logs: string[] }
  | { type: "evidence_opened"; evidenceId: string; digest: string }
  | { type: "note_recorded"; notes: object[] }
  | { type: "plan_submitted"; plan: unknown }
  | { type: "validation_rejected"; tool: string; errors: string[] }
  | { type: "assessment_submitted"; assessment: unknown }
  | { type: "quality_review_started"; sample: string }
  | { type: "review_submitted"; review: unknown }
  | { type: "revision_requested"; challenges: unknown }
  | { type: "sample_completed"; sample: string; status: string; durationMs: number }
  | { type: "error"; message: string };

export class DecisionLog {
  private seq = 0;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  append(event: DecisionEvent): void {
    const entry = { seq: ++this.seq, at: new Date().toISOString(), ...event };
    appendFileSync(this.path, JSON.stringify(entry) + "\n", "utf8");
  }
}
