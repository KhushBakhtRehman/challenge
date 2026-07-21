import { readFileSync } from "node:fs";
import type { TableEvidence, TableSheet } from "./types.js";

/**
 * Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CR/LF).
 * Small enough to own; exercised directly by unit tests.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRow();
      i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

export function parseCsv(absPath: string): TableEvidence {
  const rows = parseCsvText(readFileSync(absPath, "utf8"));
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const headerCells = nonEmpty[0] ?? [];
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const cell of headerCells) {
    let name = cell.trim() || `column_${headers.length + 1}`;
    while (seen.has(name)) name = `${name}_2`;
    seen.add(name);
    headers.push(name);
  }

  const records: TableSheet["records"] = [];
  const recordRows: number[] = [];
  for (const [index, cells] of nonEmpty.slice(1).entries()) {
    const record: TableSheet["records"][number] = {};
    for (const [i, name] of headers.entries()) {
      record[name] = coerce(cells[i] ?? "");
    }
    record["_row"] = index + 2;
    records.push(record);
    recordRows.push(index + 2);
  }

  const sheet: TableSheet = {
    name: "data",
    state: "visible",
    headerRow: 1,
    headers,
    records,
    recordRows,
    grid: null,
    formulas: [],
    hiddenRows: [],
    hiddenColumns: [],
    notes: [],
  };
  return { kind: "table", sheets: [sheet] };
}

function coerce(raw: string): string | number | null {
  const value = raw.trim();
  if (value === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}
