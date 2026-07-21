import { readFileSync } from "node:fs";
import type { TextEvidence } from "./types.js";

const MAX_CHARS = 200_000;

export function parseText(absPath: string): TextEvidence {
  const raw = readFileSync(absPath, "utf8");
  if (raw.length <= MAX_CHARS) return { kind: "text", text: raw, truncated: false };
  return { kind: "text", text: raw.slice(0, MAX_CHARS), truncated: true };
}
