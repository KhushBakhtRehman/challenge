import { describe, expect, it } from "vitest";
import { parseCsvText } from "../src/evidence/csv.js";

describe("parseCsvText", () => {
  it("parses plain rows", () => {
    expect(parseCsvText("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields with commas, quotes and newlines", () => {
    const text = 'id,comment\n1,"said ""hi"", left"\n2,"line1\nline2"\n';
    expect(parseCsvText(text)).toEqual([
      ["id", "comment"],
      ["1", 'said "hi", left'],
      ["2", "line1\nline2"],
    ]);
  });

  it("handles CRLF and a missing trailing newline", () => {
    expect(parseCsvText("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty fields", () => {
    expect(parseCsvText("a,,c\n,,\n")).toEqual([
      ["a", "", "c"],
      ["", "", ""],
    ]);
  });
});
