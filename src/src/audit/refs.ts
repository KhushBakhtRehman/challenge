import type { EvidenceFile } from "../evidence/types.js";
import type { EvidenceRef } from "./schema.js";

/**
 * Citations are only worth anything if they can't be hallucinated. The
 * registry knows every evidence id, every sheet name, every image tile and
 * every analysis id issued during a session; a submission citing anything
 * else bounces back to the model with a correction request.
 */
export class RefRegistry {
  private readonly evidence = new Map<string, EvidenceFile>();
  private readonly sheets = new Map<string, Set<string>>();
  private readonly tiles = new Map<string, number>();
  private readonly opened = new Set<string>();
  private readonly analyses = new Set<string>();

  registerEvidence(file: EvidenceFile): void {
    this.evidence.set(file.id, file);
  }

  registerSheets(evidenceId: string, sheetNames: string[]): void {
    this.sheets.set(evidenceId, new Set(sheetNames));
  }

  registerTiles(evidenceId: string, tileCount: number): void {
    this.tiles.set(evidenceId, tileCount);
  }

  markOpened(evidenceId: string): void {
    this.opened.add(evidenceId);
  }

  registerAnalysis(analysisId: string): void {
    this.analyses.add(analysisId);
  }

  isEvidence(id: string): boolean {
    return this.evidence.has(id);
  }

  validate(ref: EvidenceRef): string[] {
    const errors: string[] = [];
    const { source, locator } = ref;

    if (this.analyses.has(source)) return errors;

    const file = this.evidence.get(source);
    if (!file) {
      return [
        `citation source '${source}' does not exist — use an evidence id from the inventory or an analysis id returned by query_data`,
      ];
    }

    if (file.kind === "table") {
      const known = this.sheets.get(source);
      if (locator === null) {
        errors.push(
          `citation of workbook ${source} needs a locator like 'sheet:<name>' or 'sheet:<name>!<range>'`
        );
      } else if (!locator.startsWith("sheet:")) {
        errors.push(`workbook locator '${locator}' for ${source} must start with 'sheet:'`);
      } else if (known) {
        const sheetName = locator.slice("sheet:".length).split("!")[0] ?? "";
        if (!known.has(sheetName)) {
          errors.push(
            `sheet '${sheetName}' does not exist in ${source}; available: ${[...known].join(", ")}`
          );
        }
      }
      return errors;
    }

    if (file.kind === "image") {
      if (!this.opened.has(source)) {
        errors.push(`image ${source} was cited but never opened — open_evidence it before citing`);
      }
      const match = locator?.match(/^tile:(\d+)$/);
      if (match) {
        const tileCount = this.tiles.get(source) ?? 0;
        const n = Number(match[1]);
        if (n < 1 || n > tileCount) {
          errors.push(`tile:${n} out of range for ${source} (has ${tileCount} tiles)`);
        }
      }
      return errors;
    }

    // pdf / text: any locator is acceptable, but the evidence must have been examined
    if (!this.opened.has(source)) {
      errors.push(`${source} was cited but never opened — open_evidence it before citing`);
    }
    return errors;
  }

  validateAll(refs: EvidenceRef[]): string[] {
    return refs.flatMap((ref) => this.validate(ref));
  }
}
