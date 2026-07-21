import sharp from "sharp";
import type { ImageEvidence, ImageTile } from "./types.js";

/**
 * Screenshots of audit evidence are frequently tall (full-page captures) and
 * high-DPI. The API downscales anything above its resolution limit, which can
 * blur exactly the details that matter ("36 of 37 checks passed"). So we
 * normalise the width and slice tall images into overlapping tiles that each
 * stay within the model's native resolution.
 *
 * Bounds target current high-resolution vision models (2576px long edge,
 * ~3.75MP per image).
 */
const MAX_WIDTH = 2400;
const TILE_HEIGHT = 1500;
const OVERLAP = 120;

export async function parseImage(absPath: string): Promise<ImageEvidence> {
  const source = sharp(absPath);
  const meta = await source.metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;
  if (!originalWidth || !originalHeight) {
    throw new Error(`could not read image dimensions: ${absPath}`);
  }

  const scale = Math.min(1, MAX_WIDTH / originalWidth);
  const scaledWidth = Math.round(originalWidth * scale);
  const scaledHeight = Math.round(originalHeight * scale);
  const scaled =
    scale < 1 ? await source.resize({ width: scaledWidth }).png().toBuffer() : undefined;
  const base = scaled ? sharp(scaled) : sharp(absPath);

  const tiles: ImageTile[] = [];
  let top = 0;
  let index = 1;
  while (top < scaledHeight) {
    const height = Math.min(TILE_HEIGHT, scaledHeight - top);
    const buffer = await base
      .clone()
      .extract({ left: 0, top, width: scaledWidth, height })
      .png()
      .toBuffer();
    tiles.push({
      index,
      mediaType: "image/png",
      base64: buffer.toString("base64"),
      width: scaledWidth,
      height,
      sourceRange: `y ${top}-${top + height} of ${scaledHeight}`,
    });
    if (top + height >= scaledHeight) break;
    top += TILE_HEIGHT - OVERLAP;
    index++;
  }

  return { kind: "image", originalWidth, originalHeight, scaledWidth, tiles };
}
