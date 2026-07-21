import { describe, expect, it } from "vitest";
import { RefRegistry } from "../src/audit/refs.js";
import type { EvidenceFile } from "../src/evidence/types.js";

function file(id: string, kind: EvidenceFile["kind"]): EvidenceFile {
  return {
    id,
    file: `${id}.bin`,
    absPath: `/x/${id}`,
    mediaType: "application/octet-stream",
    bytes: 1,
    sha256: "0".repeat(64),
    shared: false,
    kind,
  };
}

function setup(): RefRegistry {
  const registry = new RefRegistry();
  registry.registerEvidence(file("E1", "table"));
  registry.registerEvidence(file("E2", "image"));
  registry.registerSheets("E1", ["Cover", "Export"]);
  registry.registerAnalysis("Q1");
  return registry;
}

describe("RefRegistry", () => {
  it("accepts analysis citations", () => {
    expect(setup().validate({ source: "Q1", locator: null, observation: "count = 3" })).toEqual([]);
  });

  it("rejects unknown sources", () => {
    const errors = setup().validate({ source: "E9", locator: null, observation: "x" });
    expect(errors[0]).toMatch(/does not exist/);
  });

  it("requires sheet locators on workbooks and validates sheet names", () => {
    const registry = setup();
    expect(registry.validate({ source: "E1", locator: null, observation: "x" })[0]).toMatch(
      /needs a locator/
    );
    expect(registry.validate({ source: "E1", locator: "row 5", observation: "x" })[0]).toMatch(
      /must start with 'sheet:'/
    );
    expect(registry.validate({ source: "E1", locator: "sheet:Nope", observation: "x" })[0]).toMatch(
      /does not exist in E1/
    );
    expect(
      registry.validate({ source: "E1", locator: "sheet:Export!A317", observation: "x" })
    ).toEqual([]);
  });

  it("requires images to be opened and tiles to exist", () => {
    const registry = setup();
    expect(registry.validate({ source: "E2", locator: "tile:1", observation: "x" })[0]).toMatch(
      /never opened/
    );
    registry.markOpened("E2");
    registry.registerTiles("E2", 3);
    expect(registry.validate({ source: "E2", locator: "tile:3", observation: "x" })).toEqual([]);
    expect(registry.validate({ source: "E2", locator: "tile:4", observation: "x" })[0]).toMatch(
      /out of range/
    );
  });
});
