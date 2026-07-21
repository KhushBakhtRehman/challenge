import { createContext, runInContext } from "node:vm";
import type { TableSheet } from "../evidence/types.js";

/**
 * Deterministic data work happens here, not in the model's head. The model
 * writes a small JavaScript program against the parsed tables; we execute it
 * in an isolated VM and log code + result verbatim. Counts, joins and
 * reconciliations are therefore reproducible by any reviewer.
 *
 * node:vm is isolation for a cooperative tool, not a hard security boundary;
 * the code only ever sees data parsed from local evidence files. See the
 * README's "Limitations" section.
 */

export interface SandboxTables {
  [evidenceId: string]: {
    [sheetName: string]: {
      headers: string[];
      records: Record<string, string | number | boolean | null>[];
      grid: { cell: string; value: string | number | boolean | null }[] | null;
    };
  };
}

export interface AnalysisOutcome {
  ok: boolean;
  resultJson: string | null;
  truncated: boolean;
  logs: string[];
  error: string | null;
}

const MAX_RESULT_CHARS = 48_000;
const MAX_LOG_LINES = 50;
const TIMEOUT_MS = 3_000;

export function buildSandboxTables(
  entries: { evidenceId: string; sheets: TableSheet[] }[]
): SandboxTables {
  const tables: SandboxTables = {};
  for (const { evidenceId, sheets } of entries) {
    tables[evidenceId] = {};
    for (const sheet of sheets) {
      tables[evidenceId][sheet.name] = {
        headers: sheet.headers,
        records: sheet.records,
        grid: sheet.grid,
      };
    }
  }
  return tables;
}

export const HELPERS_DOC = [
  "helpers.norm(v): trimmed lower-case string ('' for null/undefined) — use before comparing identifiers",
  "helpers.parseDate(v): Date for 'YYYY-MM-DD' / ISO strings / Date, else null",
  "helpers.businessDaysBetween(a, b): whole Mon-Fri days from date a (exclusive) to b (inclusive); negative if b < a",
].join("\n");

function makeHelpers() {
  const parseDate = (v: unknown): Date | null => {
    if (v instanceof Date) return v;
    if (typeof v === "number") return new Date(v);
    if (typeof v !== "string" || v.trim() === "") return null;
    const ms = Date.parse(v.trim());
    return Number.isNaN(ms) ? null : new Date(ms);
  };
  return {
    norm: (v: unknown): string =>
      String(v ?? "")
        .trim()
        .toLowerCase(),
    parseDate,
    businessDaysBetween: (a: unknown, b: unknown): number | null => {
      const from = parseDate(a);
      const to = parseDate(b);
      if (!from || !to) return null;
      const sign = to >= from ? 1 : -1;
      const [start, end] = sign === 1 ? [from, to] : [to, from];
      let days = 0;
      const cursor = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
      );
      const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      while (cursor.getTime() < last) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        const dow = cursor.getUTCDay();
        if (dow !== 0 && dow !== 6) days++;
      }
      return days * sign;
    },
  };
}

export function runAnalysis(tables: SandboxTables, code: string): AnalysisOutcome {
  const logs: string[] = [];
  const sandbox = {
    tables: structuredClone(tables),
    helpers: makeHelpers(),
    console: {
      log: (...args: unknown[]) => {
        if (logs.length < MAX_LOG_LINES) logs.push(args.map(stringify).join(" "));
      },
    },
  };
  const context = createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });

  // A bare script's completion value is the result; code written as a
  // function body (`return x`) is a SyntaxError at top level, so retry it
  // wrapped in an IIFE.
  let value: unknown;
  try {
    value = runInContext(code, context, { timeout: TIMEOUT_MS });
  } catch (error) {
    // Errors thrown inside the VM belong to the context's realm, so
    // `instanceof SyntaxError` is always false here — duck-type instead.
    if (errorName(error) === "SyntaxError" && /return/i.test(message(error))) {
      try {
        value = runInContext(`(function () {\n${code}\n})()`, context, { timeout: TIMEOUT_MS });
      } catch (wrappedError) {
        return {
          ok: false,
          resultJson: null,
          truncated: false,
          logs,
          error: message(wrappedError),
        };
      }
    } else {
      return { ok: false, resultJson: null, truncated: false, logs, error: message(error) };
    }
  }

  if (value === undefined) {
    return {
      ok: false,
      resultJson: null,
      truncated: false,
      logs,
      error:
        "code evaluated to undefined — end with an expression (or `return <value>`) that is the analysis result",
    };
  }

  let json: string;
  try {
    json = JSON.stringify(value, (_k, v) => (v === undefined ? null : v)) ?? "null";
  } catch (error) {
    return {
      ok: false,
      resultJson: null,
      truncated: false,
      logs,
      error: `result not JSON-serialisable: ${message(error)}`,
    };
  }

  if (json.length > MAX_RESULT_CHARS) {
    return {
      ok: true,
      resultJson: json.slice(0, MAX_RESULT_CHARS),
      truncated: true,
      logs,
      error: null,
    };
  }
  return { ok: true, resultJson: json, truncated: false, logs, error: null };
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error
    ? String((error as { name: unknown }).name)
    : "";
}

function message(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const name = errorName(error);
    const text = String((error as { message: unknown }).message);
    return name ? `${name}: ${text}` : text;
  }
  return String(error);
}
