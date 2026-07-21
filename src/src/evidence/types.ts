/** Parsed representations of evidence files, produced deterministically at load time. */

export interface EvidenceFile {
  /** Harness-issued id: E1, E2, ... stable within a sample (shared evidence first, then sample files, both sorted by name). */
  id: string;
  /** Path relative to the control folder. */
  file: string;
  absPath: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  /** True when the file sits at the control root and is shared across samples. */
  shared: boolean;
  kind: "table" | "image" | "pdf" | "text" | "unsupported";
}

/** A rectangular view of one sheet (or one CSV file). */
export interface TableSheet {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  headerRow: number | null;
  headers: string[];
  /** Row objects keyed by header; values normalised to string | number | boolean | null. */
  records: Record<string, string | number | boolean | null>[];
  /** 1-based row numbers (in the original sheet) each record came from, parallel to `records`. */
  recordRows: number[];
  /** A1-style cell dump for sheets too small/irregular for header inference. */
  grid: { cell: string; value: string | number | boolean | null }[] | null;
  formulas: { cell: string; formula: string }[];
  hiddenRows: number[];
  hiddenColumns: string[];
  notes: { cell: string; text: string }[];
}

export interface TableEvidence {
  kind: "table";
  sheets: TableSheet[];
}

export interface ImageTile {
  /** 1-based tile index, top to bottom. */
  index: number;
  mediaType: "image/png";
  base64: string;
  width: number;
  height: number;
  /** Y-range of the tile in the (scaled) source image, for locator context. */
  sourceRange: string;
}

export interface ImageEvidence {
  kind: "image";
  originalWidth: number;
  originalHeight: number;
  scaledWidth: number;
  tiles: ImageTile[];
}

export interface PdfEvidence {
  kind: "pdf";
  base64: string;
}

export interface TextEvidence {
  kind: "text";
  text: string;
  truncated: boolean;
}

export type EvidenceContent = TableEvidence | ImageEvidence | PdfEvidence | TextEvidence;
