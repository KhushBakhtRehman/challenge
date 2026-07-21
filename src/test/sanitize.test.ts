import { describe, expect, it } from "vitest";
import { decodeModelText } from "../src/agent/sanitize.js";

describe("decodeModelText", () => {
  it("decodes double-escaped unicode sequences the model sometimes emits", () => {
    expect(decodeModelText("CHG-2101\\u2013CHG-2110")).toBe("CHG-2101–CHG-2110");
    expect(decodeModelText("dash \\u2014 here")).toBe("dash — here");
  });

  it("removes stray backslash escapes before punctuation", () => {
    expect(decodeModelText("records (CHG-2101\\, CHG-2102)")).toBe("records (CHG-2101, CHG-2102)");
  });

  it("walks nested structures and leaves non-strings alone", () => {
    expect(decodeModelText({ a: ["x\\u2013y", 5, null], b: { c: "plain", d: true } })).toEqual({
      a: ["x–y", 5, null],
      b: { c: "plain", d: true },
    });
  });

  it("leaves normal text and real newline escapes untouched", () => {
    expect(decodeModelText("path\\to\\file and a|b")).toBe("path\\to\\file and a|b");
    expect(decodeModelText("line1\nline2")).toBe("line1\nline2");
  });
});
