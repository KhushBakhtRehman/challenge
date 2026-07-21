import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { parseCsv } from "./csv.js";
import { parseImage } from "./image.js";
import { parseText } from "./text.js";
import type { EvidenceContent, EvidenceFile } from "./types.js";
import { parseXlsx } from "./xlsx.js";

const MEDIA_TYPES: Record<string, { mediaType: string; kind: EvidenceFile["kind"] }> = {
  ".xlsx": {
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "table",
  },
  ".xlsm": { mediaType: "application/vnd.ms-excel.sheet.macroEnabled.12", kind: "table" },
  ".csv": { mediaType: "text/csv", kind: "table" },
  ".png": { mediaType: "image/png", kind: "image" },
  ".jpg": { mediaType: "image/jpeg", kind: "image" },
  ".jpeg": { mediaType: "image/jpeg", kind: "image" },
  ".webp": { mediaType: "image/webp", kind: "image" },
  ".gif": { mediaType: "image/gif", kind: "image" },
  ".pdf": { mediaType: "application/pdf", kind: "pdf" },
  ".txt": { mediaType: "text/plain", kind: "text" },
  ".md": { mediaType: "text/markdown", kind: "text" },
  ".json": { mediaType: "application/json", kind: "text" },
  ".log": { mediaType: "text/plain", kind: "text" },
  ".eml": { mediaType: "message/rfc822", kind: "text" },
};

export function describeFile(
  absPath: string,
  relPath: string,
  id: string,
  shared: boolean
): EvidenceFile {
  const ext = extname(absPath).toLowerCase();
  const media = MEDIA_TYPES[ext] ?? {
    mediaType: "application/octet-stream",
    kind: "unsupported" as const,
  };
  const bytes = statSync(absPath).size;
  const sha256 = createHash("sha256").update(readFileSync(absPath)).digest("hex");
  return {
    id,
    file: relPath,
    absPath,
    mediaType: media.mediaType,
    bytes,
    sha256,
    shared,
    kind: media.kind,
  };
}

const contentCache = new Map<string, Promise<EvidenceContent>>();

/** Parse an evidence file into its structured form; memoised per path. */
export function loadEvidence(file: EvidenceFile): Promise<EvidenceContent> {
  const cached = contentCache.get(file.absPath);
  if (cached) return cached;

  const loaded = (async (): Promise<EvidenceContent> => {
    switch (file.kind) {
      case "table":
        return file.file.toLowerCase().endsWith(".csv")
          ? parseCsv(file.absPath)
          : parseXlsx(file.absPath);
      case "image":
        return parseImage(file.absPath);
      case "pdf":
        return { kind: "pdf", base64: readFileSync(file.absPath).toString("base64") };
      case "text":
        return parseText(file.absPath);
      case "unsupported":
        throw new Error(`unsupported evidence type: ${file.file}`);
    }
  })();
  contentCache.set(file.absPath, loaded);
  return loaded;
}
