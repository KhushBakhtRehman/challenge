import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverControl, discoverControls } from "../src/control/discover.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "attest-discover-"));
}

describe("discoverControl", () => {
  it("treats root evidence as a single sample when there is no samples dir", () => {
    const dir = tmp();
    writeFileSync(join(dir, "control.md"), "# Control\n## Control Attributes\n* a1");
    writeFileSync(join(dir, "export.csv"), "a,b,c\n1,2,3\n");
    writeFileSync(join(dir, "roster.csv"), "x,y,z\n1,2,3\n");

    const control = discoverControl(dir);
    expect(control.documents.map((d) => d.file)).toEqual(["control.md"]);
    expect(control.samples).toHaveLength(1);
    expect(control.samples[0]?.name).toBe("sample-1");
    expect(control.samples[0]?.evidence.map((e) => e.id)).toEqual(["E1", "E2"]);
  });

  it("maps samples/ subdirectories to samples and shares root evidence", () => {
    const dir = tmp();
    writeFileSync(join(dir, "control.md"), "# Control");
    writeFileSync(join(dir, "policy.md"), "# Policy");
    writeFileSync(join(dir, "shared.csv"), "a,b,c\n");
    mkdirSync(join(dir, "samples", "sample-2"), { recursive: true });
    mkdirSync(join(dir, "samples", "sample-1"), { recursive: true });
    writeFileSync(join(dir, "samples", "sample-1", "shot.png"), "not-a-real-png");
    writeFileSync(join(dir, "samples", "sample-2", "shot2.png"), "not-a-real-png");

    const control = discoverControl(dir);
    expect(control.documents.map((d) => d.file)).toEqual(["control.md", "policy.md"]);
    expect(control.samples.map((s) => s.name)).toEqual(["sample-1", "sample-2"]);
    const first = control.samples[0];
    expect(first?.evidence.map((e) => [e.id, e.shared])).toEqual([
      ["E1", true],
      ["E2", false],
    ]);
  });

  it("treats loose files under samples/ as single-file samples", () => {
    const dir = tmp();
    writeFileSync(join(dir, "control.md"), "# Control");
    mkdirSync(join(dir, "samples"));
    writeFileSync(join(dir, "samples", "q1-review.csv"), "a,b,c\n");
    writeFileSync(join(dir, "samples", "q2-review.csv"), "a,b,c\n");

    const control = discoverControl(dir);
    expect(control.samples.map((s) => s.name)).toEqual(["q1-review", "q2-review"]);
  });

  it("rejects folders without control documentation", () => {
    const dir = tmp();
    writeFileSync(join(dir, "export.csv"), "a,b\n");
    expect(() => discoverControl(dir)).toThrow(/no markdown control documentation/);
  });
});

describe("discoverControls", () => {
  it("expands a parent directory into its control folders", () => {
    const dir = tmp();
    for (const name of ["control-b", "control-a"]) {
      mkdirSync(join(dir, name));
      writeFileSync(join(dir, name, "control.md"), "# C");
      writeFileSync(join(dir, name, "evidence.csv"), "a,b,c\n");
    }
    const controls = discoverControls(dir);
    expect(controls.map((c) => c.name)).toEqual(["control-a", "control-b"]);
  });

  it("resolves a samples/ directory up to its control", () => {
    const dir = tmp();
    writeFileSync(join(dir, "control.md"), "# C");
    mkdirSync(join(dir, "samples", "sample-1"), { recursive: true });
    writeFileSync(join(dir, "samples", "sample-1", "e.csv"), "a,b,c\n");

    const controls = discoverControls(join(dir, "samples"));
    expect(controls).toHaveLength(1);
    expect(controls[0]?.samples.map((s) => s.name)).toEqual(["sample-1"]);
  });

  it("resolves a single sample directory to just that sample", () => {
    const dir = tmp();
    writeFileSync(join(dir, "control.md"), "# C");
    for (const name of ["sample-1", "sample-2"]) {
      mkdirSync(join(dir, "samples", name), { recursive: true });
      writeFileSync(join(dir, "samples", name, "e.csv"), "a,b,c\n");
    }

    const controls = discoverControls(join(dir, "samples", "sample-2"));
    expect(controls).toHaveLength(1);
    expect(controls[0]?.samples.map((s) => s.name)).toEqual(["sample-2"]);
  });

  it("rejects paths with no control documentation anywhere nearby", () => {
    const dir = tmp();
    mkdirSync(join(dir, "not-samples", "deep"), { recursive: true });
    expect(() => discoverControls(join(dir, "not-samples", "deep"))).toThrow(
      /no markdown control docs/
    );
  });
});
