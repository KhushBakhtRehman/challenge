import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { parseXlsx, columnLetter } from "../src/evidence/xlsx.js";
import type { TableEvidence } from "../src/evidence/types.js";

let parsed: TableEvidence;

beforeAll(async () => {
  const wb = new ExcelJS.Workbook();

  const cover = wb.addWorksheet("Cover");
  cover.getCell("A1").value = "User Access Review";
  cover.getCell("A3").value = "System";
  cover.getCell("B3").value = "NetSuite";

  const data = wb.addWorksheet("Export");
  data.addRow(["Username", "Status", "Last Login"]);
  data.addRow([]);
  data.addRow(["ann", "Active", new Date(Date.UTC(2026, 5, 7))]);
  data.addRow(["bob", "Inactive", null]);
  data.getRow(4).hidden = true;
  data.getCell("D3").value = { formula: "1+1", result: 2 } as ExcelJS.CellValue;
  data.getCell("A3").note = "flagged by reviewer";

  const secret = wb.addWorksheet("Secrets");
  secret.state = "hidden";
  secret.getCell("A1").value = "do not show";

  const dir = mkdtempSync(join(tmpdir(), "attest-xlsx-"));
  const file = join(dir, "wb.xlsx");
  await wb.xlsx.writeFile(file);
  parsed = await parseXlsx(file);
});

describe("parseXlsx", () => {
  it("keeps key-value sheets in grid form (no bogus header inference)", () => {
    const cover = parsed.sheets.find((s) => s.name === "Cover");
    expect(cover?.headers).toEqual([]);
    expect(cover?.grid).toEqual([
      { cell: "A1", value: "User Access Review" },
      { cell: "A3", value: "System" },
      { cell: "B3", value: "NetSuite" },
    ]);
  });

  it("infers headers and skips blank rows", () => {
    const sheet = parsed.sheets.find((s) => s.name === "Export");
    expect(sheet?.headers).toEqual(["Username", "Status", "Last Login"]);
    expect(sheet?.records).toHaveLength(2);
    expect(sheet?.records[0]).toMatchObject({ Username: "ann", Status: "Active" });
  });

  it("normalises dates to ISO and records source rows", () => {
    const sheet = parsed.sheets.find((s) => s.name === "Export");
    expect(sheet?.records[0]?.["Last Login"]).toBe("2026-06-07");
    expect(sheet?.records[0]?.["_row"]).toBe(3);
    expect(sheet?.records[1]?.["_row"]).toBe(4);
  });

  it("surfaces hidden sheets, hidden rows, formulas and notes", () => {
    const secret = parsed.sheets.find((s) => s.name === "Secrets");
    expect(secret?.state).toBe("hidden");

    const sheet = parsed.sheets.find((s) => s.name === "Export");
    expect(sheet?.hiddenRows).toContain(4);
    expect(sheet?.formulas).toEqual([{ cell: "D3", formula: "1+1" }]);
    expect(sheet?.notes).toEqual([{ cell: "A3", text: "flagged by reviewer" }]);
  });
});

describe("columnLetter", () => {
  it("maps column numbers to letters", () => {
    expect(columnLetter(1)).toBe("A");
    expect(columnLetter(26)).toBe("Z");
    expect(columnLetter(27)).toBe("AA");
    expect(columnLetter(52)).toBe("AZ");
  });
});
