import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { describeFile } from "../evidence/inventory.js";
import type { EvidenceFile } from "../evidence/types.js";

export interface ControlDocument {
  file: string;
  sha256: string;
  text: string;
}

export interface Sample {
  name: string;
  /** Shared control-level evidence first, then the sample's own files. */
  evidence: EvidenceFile[];
}

export interface ControlFolder {
  name: string;
  path: string;
  documents: ControlDocument[];
  samples: Sample[];
}

/**
 * A control folder layout is data, not configuration, so discovery has to be
 * generic. The rules:
 *
 *   - Markdown files at the folder root are control documentation (control
 *     description, testing policies, ...). `control.md` sorts first.
 *   - If a `samples/` directory exists, each subdirectory is one sample;
 *     loose files inside `samples/` are each their own single-file sample.
 *     Non-doc files at the control root are shared evidence available to
 *     every sample (e.g. a common HRIS export).
 *   - Without `samples/`, all non-doc files at the root form a single sample.
 */
export function discoverControl(path: string): ControlFolder {
  const entries = readdirSync(path, { withFileTypes: true });
  const documents: ControlDocument[] = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => {
      const abs = join(path, e.name);
      const text = readFileSync(abs, "utf8");
      return { file: e.name, sha256: sha256(abs), text };
    })
    .sort((a, b) => docRank(a.file) - docRank(b.file) || a.file.localeCompare(b.file));

  if (documents.length === 0) {
    throw new Error(
      `${path} does not look like a control folder: no markdown control documentation found`
    );
  }

  const rootFiles = entries
    .filter((e) => e.isFile() && !e.name.toLowerCase().endsWith(".md") && !e.name.startsWith("."))
    .map((e) => join(path, e.name))
    .sort();

  const samplesDir = join(path, "samples");
  const samples: Sample[] = [];

  if (existsSync(samplesDir) && statSync(samplesDir).isDirectory()) {
    const sampleEntries = readdirSync(samplesDir, { withFileTypes: true });
    for (const entry of sampleEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        const files = walkFiles(join(samplesDir, entry.name));
        samples.push(buildSample(path, entry.name, rootFiles, files));
      } else if (entry.isFile()) {
        samples.push(
          buildSample(path, stem(entry.name), rootFiles, [join(samplesDir, entry.name)])
        );
      }
    }
  }

  if (samples.length === 0) {
    if (rootFiles.length === 0) {
      throw new Error(`${path} contains control documentation but no evidence files`);
    }
    samples.push(buildSample(path, "sample-1", [], rootFiles));
  }

  return { name: basename(path), path, documents, samples };
}

/**
 * Accept any path a reviewer might reasonably point at:
 *   - a control folder,
 *   - a directory of control folders (e.g. data/),
 *   - a control's samples/ directory (runs the whole control),
 *   - a single sample directory inside samples/ (runs just that sample).
 */
export function discoverControls(path: string): ControlFolder[] {
  if (hasControlDocs(path)) return [discoverControl(path)];

  const children = readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => join(path, e.name))
    .filter(hasControlDocs)
    .sort();
  if (children.length > 0) return children.map(discoverControl);

  // Inside a control folder? Resolve upwards from samples/ or a sample dir.
  const parent = dirname(path);
  if (hasControlDocs(parent)) {
    return [discoverControl(parent)];
  }
  const grandparent = dirname(parent);
  if (basename(parent).toLowerCase() === "samples" && hasControlDocs(grandparent)) {
    const control = discoverControl(grandparent);
    const name = basename(path);
    const sample = control.samples.find((s) => s.name === name);
    if (!sample) {
      throw new Error(
        `${name} is not a sample of ${control.name} (has: ${control.samples.map((s) => s.name).join(", ")})`
      );
    }
    return [{ ...control, samples: [sample] }];
  }

  throw new Error(
    `${path} contains no control folders (no markdown control docs found here, in its subdirectories, or in its parents)`
  );
}

function hasControlDocs(path: string): boolean {
  try {
    return readdirSync(path).some((f) => f.toLowerCase().endsWith(".md"));
  } catch {
    return false;
  }
}

function buildSample(
  controlPath: string,
  name: string,
  sharedFiles: string[],
  ownFiles: string[]
): Sample {
  const evidence: EvidenceFile[] = [];
  let n = 1;
  for (const abs of sharedFiles) {
    evidence.push(describeFile(abs, relative(controlPath, abs), `E${n++}`, true));
  }
  for (const abs of ownFiles.sort()) {
    evidence.push(describeFile(abs, relative(controlPath, abs), `E${n++}`, false));
  }
  return { name, evidence };
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function docRank(file: string): number {
  return file.toLowerCase() === "control.md" ? 0 : 1;
}

function stem(file: string): string {
  return file.replace(/\.[^.]+$/, "");
}

function sha256(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}
