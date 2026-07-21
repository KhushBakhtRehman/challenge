import { describe, expect, it } from "vitest";
import { runAnalysis, type SandboxTables } from "../src/agent/analysis.js";

const tables: SandboxTables = {
  E1: {
    data: {
      headers: ["name", "status", "terminated"],
      records: [
        { name: "ann", status: "Active", terminated: null, _row: 2 },
        { name: "bob", status: "Active", terminated: "2021-07-26", _row: 3 },
        { name: "cat", status: "Inactive", terminated: "2023-01-01", _row: 4 },
      ],
      grid: null,
    },
  },
};

describe("runAnalysis", () => {
  it("evaluates a bare final expression", () => {
    const outcome = runAnalysis(
      tables,
      `tables.E1.data.records.filter(r => r.status === "Active").length`
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.resultJson).toBe("2");
  });

  it("supports return-style code", () => {
    const outcome = runAnalysis(
      tables,
      `const bad = tables.E1.data.records.filter(r => r.terminated && r.status === "Active");
       return bad.map(r => ({ name: r.name, row: r._row }));`
    );
    expect(outcome.ok).toBe(true);
    expect(JSON.parse(outcome.resultJson as string)).toEqual([{ name: "bob", row: 3 }]);
  });

  it("supports nested returns inside a bare expression script", () => {
    const outcome = runAnalysis(
      tables,
      `const active = tables.E1.data.records.filter(r => { return r.status === "Active"; });
       active.length`
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.resultJson).toBe("2");
  });

  it("captures console.log output", () => {
    const outcome = runAnalysis(tables, `console.log("checking", 3); 42`);
    expect(outcome.logs).toEqual(["checking 3"]);
    expect(outcome.resultJson).toBe("42");
  });

  it("rejects undefined results with guidance", () => {
    const outcome = runAnalysis(tables, `const x = 1;`);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/undefined/);
  });

  it("reports runtime errors", () => {
    const outcome = runAnalysis(tables, `tables.NOPE.data.records.length`);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/TypeError/);
  });

  it("times out runaway code", () => {
    const outcome = runAnalysis(tables, `while (true) {} 1`);
    expect(outcome.ok).toBe(false);
  });

  it("does not leak host globals", () => {
    const outcome = runAnalysis(
      tables,
      `typeof process === "undefined" && typeof require === "undefined"`
    );
    expect(outcome.resultJson).toBe("true");
  });

  it("cannot mutate tables across calls", () => {
    runAnalysis(tables, `tables.E1.data.records.push({name: "evil"}); 1`);
    const outcome = runAnalysis(tables, `tables.E1.data.records.length`);
    expect(outcome.resultJson).toBe("3");
  });

  it("computes business days", () => {
    const outcome = runAnalysis(
      tables,
      `helpers.businessDaysBetween("2026-06-05", "2026-06-12")` // Fri -> next Fri
    );
    expect(outcome.resultJson).toBe("5");
  });
});
