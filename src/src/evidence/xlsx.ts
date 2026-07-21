import ExcelJS from "exceljs";
import type { TableEvidence, TableSheet } from "./types.js";

type Scalar = string | number | boolean | null;

const MAX_GRID_CELLS = 400;

/**
 * Parse a workbook into a deterministic table model: normalised values,
 * inferred headers, plus everything an auditor would want surfaced that a
 * casual reader misses — hidden sheets/rows/columns, formulas, and cell notes.
 */
export async function parseXlsx(absPath: string): Promise<TableEvidence> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absPath);

  const sheets: TableSheet[] = [];
  workbook.eachSheet((ws) => {
    sheets.push(parseSheet(ws));
  });
  return { kind: "table", sheets };
}

function parseSheet(ws: ExcelJS.Worksheet): TableSheet {
  const rows: { rowNumber: number; cells: Map<number, Scalar> }[] = [];
  const formulas: { cell: string; formula: string }[] = [];
  const notes: { cell: string; text: string }[] = [];
  const hiddenRows: number[] = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (row.hidden) hiddenRows.push(rowNumber);
    const cells = new Map<number, Scalar>();
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const value = normaliseCell(cell.value);
      if (value !== null) cells.set(colNumber, value);
      if (cell.formula) formulas.push({ cell: cell.address, formula: String(cell.formula) });
      const note = readNote(cell.note);
      if (note) notes.push({ cell: cell.address, text: note });
    });
    if (cells.size > 0) rows.push({ rowNumber, cells });
  });

  const hiddenColumns: string[] = [];
  for (let c = 1; c <= ws.columnCount; c++) {
    if (ws.getColumn(c).hidden) hiddenColumns.push(columnLetter(c));
  }

  const header = inferHeader(rows);
  let headers: string[] = [];
  const records: Record<string, Scalar>[] = [];
  const recordRows: number[] = [];
  let grid: { cell: string; value: Scalar }[] | null = null;

  if (header) {
    headers = header.names;
    for (const row of rows) {
      if (row.rowNumber <= header.rowNumber) continue;
      const record: Record<string, Scalar> = {};
      for (const [i, name] of headers.entries()) {
        record[name] = row.cells.get(header.columns[i] as number) ?? null;
      }
      record["_row"] = row.rowNumber;
      records.push(record);
      recordRows.push(row.rowNumber);
    }
  } else {
    grid = [];
    outer: for (const row of rows) {
      for (const [col, value] of [...row.cells.entries()].sort((a, b) => a[0] - b[0])) {
        if (grid.length >= MAX_GRID_CELLS) break outer;
        grid.push({ cell: `${columnLetter(col)}${row.rowNumber}`, value });
      }
    }
  }

  return {
    name: ws.name,
    state: (ws.state as TableSheet["state"]) ?? "visible",
    headerRow: header?.rowNumber ?? null,
    headers,
    records,
    recordRows,
    grid,
    formulas,
    hiddenRows,
    hiddenColumns,
    notes,
  };
}

/**
 * The first row with >= 3 non-empty cells, all strings, is treated as the
 * header row. Two-column sheets (cover pages, key-value summaries) stay in
 * grid form, which preserves their layout for the model.
 */
function inferHeader(
  rows: { rowNumber: number; cells: Map<number, Scalar> }[]
): { rowNumber: number; names: string[]; columns: number[] } | null {
  for (const row of rows.slice(0, 10)) {
    const entries = [...row.cells.entries()].sort((a, b) => a[0] - b[0]);
    if (entries.length < 3) continue;
    if (!entries.every(([, v]) => typeof v === "string")) continue;
    const names: string[] = [];
    const columns: number[] = [];
    const seen = new Set<string>();
    for (const [col, value] of entries) {
      let name = String(value).trim();
      while (seen.has(name)) name = `${name}_2`;
      seen.add(name);
      names.push(name);
      columns.push(col);
    }
    return { rowNumber: row.rowNumber, names, columns };
  }
  return null;
}

function normaliseCell(value: ExcelJS.CellValue): Scalar {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("") || null;
    if ("hyperlink" in value) return value.text ?? value.hyperlink;
    if ("error" in value) return `#ERROR:${value.error}`;
    if ("result" in value) return normaliseCell(value.result as ExcelJS.CellValue);
    if ("formula" in value) return null;
  }
  return String(value);
}

function readNote(note: ExcelJS.Cell["note"]): string | null {
  if (!note) return null;
  if (typeof note === "string") return note;
  return note.texts?.map((t) => t.text).join("") ?? null;
}

function toIsoDate(d: Date): string {
  const iso = d.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

export function columnLetter(col: number): string {
  let s = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}
