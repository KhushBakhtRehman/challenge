import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  OpenEvidenceSchema,
  QueryDataSchema,
  RecordEvidenceSchema,
  SubmitAssessmentSchema,
  SubmitReviewSchema,
  SubmitTestPlanSchema,
} from "../audit/schema.js";
import type { EvidenceContent, EvidenceFile, TableSheet } from "../evidence/types.js";
import { HELPERS_DOC } from "./analysis.js";

function toInputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json["$schema"];
  return json as Anthropic.Tool.InputSchema;
}

function tool(name: string, description: string, schema: z.ZodType): Anthropic.Tool {
  return {
    name,
    description,
    input_schema: toInputSchema(schema),
    // Strict tool use: the API guarantees inputs validate against the schema.
    strict: true,
  };
}

export const submitTestPlanTool = tool(
  "submit_test_plan",
  "Submit the test plan for this control before examining evidence. Extract every control " +
    "attribute verbatim from the control documentation, state how you interpret it as a testable " +
    "requirement, and map concrete procedures to the kinds of evidence in the inventory.",
  SubmitTestPlanSchema
);

export const openEvidenceTool = tool(
  "open_evidence",
  "Open one evidence file for examination. Images are returned as high-resolution tiles " +
    "(cite as 'tile:<n>'); workbooks as per-sheet schemas with sample records (full data is in " +
    "the query_data sandbox); PDFs and text verbatim. Open every piece of evidence you rely on.",
  OpenEvidenceSchema
);

export const queryDataTool = tool(
  "query_data",
  "Run JavaScript over the parsed tabular evidence in a sandbox and get the result back. " +
    "Use this for every count, join, filter, reconciliation, or date computation — never " +
    "eyeball tabular data. `tables[evidenceId][sheetName]` has {headers, records, grid}; " +
    "records are objects keyed by header, plus `_row` (the source row number, for citations). " +
    "Sheets without an inferred header table expose `grid` ([{cell, value}]) instead of records.\n" +
    "Available helpers:\n" +
    HELPERS_DOC +
    "\nEnd with an expression (or `return`) whose value is the result; keep results small and " +
    "targeted (aggregate, don't dump whole tables). The call returns an analysis id 'Qn' — " +
    "cite computed facts with it.",
  QueryDataSchema
);

export const recordEvidenceTool = tool(
  "record_evidence",
  "Record extraction notes: discrete facts observed in the evidence, each tied to its source. " +
    "These notes form the examination trail in the workpaper, separate from your judgments. " +
    "Record what you SEE (dates, names, statuses, counts), especially from images, before " +
    "concluding anything from it.",
  RecordEvidenceSchema
);

export const submitAssessmentTool = tool(
  "submit_assessment",
  "Submit the final assessment for this sample: one entry per attribute in the approved test " +
    "plan, with verdicts, full reasoning, and citations for every factual claim. This ends the " +
    "engagement for the sample. The harness validates structure and citations and will return " +
    "errors to fix rather than accepting a flawed submission.",
  SubmitAssessmentSchema
);

export const submitReviewTool = tool(
  "submit_review",
  "Submit the quality-review conclusion: which attribute assessments withstand review " +
    "(confirmed) and which are challenged, with citations for every challenge. 'blocking' " +
    "challenges send the assessment back for revision; 'note' challenges are recorded in the " +
    "workpaper. This ends the review.",
  SubmitReviewSchema
);

/** ----- Rendering evidence for the model ----- */

const RECORD_PREVIEW_COUNT = 8;

export function renderInventoryLine(file: EvidenceFile): string {
  const shared = file.shared ? " (shared control-level evidence)" : "";
  return `- ${file.id}: ${file.file} — ${file.mediaType}, ${formatBytes(file.bytes)}, sha256 ${file.sha256.slice(0, 12)}…${shared}`;
}

export function renderSheetSummary(evidenceId: string, sheet: TableSheet): string {
  const lines: string[] = [];
  const flags: string[] = [];
  if (sheet.state !== "visible") flags.push(`SHEET IS ${sheet.state.toUpperCase()}`);
  if (sheet.hiddenRows.length > 0)
    flags.push(`${sheet.hiddenRows.length} hidden row(s): ${preview(sheet.hiddenRows)}`);
  if (sheet.hiddenColumns.length > 0)
    flags.push(`hidden column(s): ${sheet.hiddenColumns.join(", ")}`);
  if (sheet.formulas.length > 0) flags.push(`${sheet.formulas.length} formula cell(s)`);
  if (sheet.notes.length > 0) flags.push(`${sheet.notes.length} cell note(s)`);

  lines.push(
    `  - sheet "${sheet.name}": ` +
      (sheet.headers.length > 0
        ? `${sheet.records.length} records, columns [${sheet.headers.join(", ")}] (header row ${sheet.headerRow})`
        : `${sheet.grid?.length ?? 0} populated cells (no header table — see grid)`)
  );
  if (flags.length > 0) lines.push(`    ⚠ ${flags.join("; ")}`);
  lines.push(`    query as tables[${JSON.stringify(evidenceId)}][${JSON.stringify(sheet.name)}]`);
  return lines.join("\n");
}

export function renderEvidenceContent(
  file: EvidenceFile,
  content: EvidenceContent
): Anthropic.ContentBlockParam[] {
  switch (content.kind) {
    case "table":
      return [{ type: "text", text: renderTable(file, content.sheets) }];
    case "image": {
      const blocks: Anthropic.ContentBlockParam[] = [
        {
          type: "text",
          text:
            `${file.id} ${file.file} — image ${content.originalWidth}x${content.originalHeight}px, ` +
            `rendered at width ${content.scaledWidth}px as ${content.tiles.length} tile(s), top to bottom ` +
            `with slight overlap. Cite locations as 'tile:<n>'.`,
        },
      ];
      for (const tile of content.tiles) {
        blocks.push({
          type: "text",
          text: `--- ${file.id} tile:${tile.index} (${tile.sourceRange}) ---`,
        });
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: tile.mediaType, data: tile.base64 },
        });
      }
      return blocks;
    }
    case "pdf":
      return [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: content.base64 },
        },
        {
          type: "text",
          text: `${file.id} ${file.file} — PDF document (above). Cite as 'page <n>'.`,
        },
      ];
    case "text": {
      const note = content.truncated ? "\n[truncated for length]" : "";
      return [
        {
          type: "text",
          text: `${file.id} ${file.file} — text content:\n\`\`\`\n${content.text}\n\`\`\`${note}`,
        },
      ];
    }
  }
}

function renderTable(file: EvidenceFile, sheets: TableSheet[]): string {
  const parts: string[] = [`${file.id} ${file.file} — workbook with ${sheets.length} sheet(s).`];
  for (const sheet of sheets) {
    parts.push(renderSheetSummary(file.id, sheet));
    if (sheet.grid) {
      parts.push(
        `    grid: ${sheet.grid.map((c) => `${c.cell}=${JSON.stringify(c.value)}`).join(" | ")}`
      );
    }
    if (sheet.records.length > 0) {
      const shown = sheet.records.slice(0, RECORD_PREVIEW_COUNT);
      parts.push(
        `    first ${shown.length} of ${sheet.records.length} records:\n` +
          shown.map((r) => `      ${JSON.stringify(r)}`).join("\n")
      );
      if (sheet.records.length > shown.length) {
        parts.push(`    (remaining ${sheet.records.length - shown.length} records via query_data)`);
      }
    }
    if (sheet.formulas.length > 0) {
      const shown = sheet.formulas.slice(0, 20);
      parts.push(
        `    formulas: ${shown.map((f) => `${f.cell}=${f.formula}`).join("; ")}` +
          (sheet.formulas.length > 20 ? ` … (${sheet.formulas.length - 20} more)` : "")
      );
    }
    if (sheet.notes.length > 0) {
      parts.push(`    cell notes: ${sheet.notes.map((n) => `${n.cell}: ${n.text}`).join("; ")}`);
    }
  }
  return parts.join("\n");
}

/** Compact digest of opened evidence for the decision log (no payloads). */
export function digestContent(content: EvidenceContent): string {
  switch (content.kind) {
    case "table":
      return `table: ${content.sheets.map((s) => `${s.name}(${s.records.length} records)`).join(", ")}`;
    case "image":
      return `image: ${content.tiles.length} tiles at width ${content.scaledWidth}`;
    case "pdf":
      return `pdf: ${Math.round(content.base64.length * 0.75)} bytes`;
    case "text":
      return `text: ${content.text.length} chars${content.truncated ? " (truncated)" : ""}`;
  }
}

function preview(nums: number[]): string {
  const shown = nums.slice(0, 10).join(", ");
  return nums.length > 10 ? `${shown}, …` : shown;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
