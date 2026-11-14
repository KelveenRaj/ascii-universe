/** Pure helpers for 8×8 one-bit glyph bitmaps (row-major, top row first, 0 or 1 per pixel). */
export const GLYPH_SIZE = 8;
export type Bitmap = Uint8Array; // length GLYPH_SIZE * GLYPH_SIZE

export const emptyBitmap = (): Bitmap => new Uint8Array(GLYPH_SIZE * GLYPH_SIZE);

/** Fraction of lit pixels, 0..1. */
export function coverage(bm: Bitmap): number {
  let lit = 0;
  for (const px of bm) lit += px;
  return lit / bm.length;
}

// 4×4 Bayer matrix, values 0..15
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Ordered-dither block with the given fill fraction (0..1): the classic ░▒▓█ look. */
export function ditherBitmap(fill: number): Bitmap {
  const bm = emptyBitmap();
  const threshold = Math.round(Math.min(1, Math.max(0, fill)) * 16);
  for (let y = 0; y < GLYPH_SIZE; y++) {
    for (let x = 0; x < GLYPH_SIZE; x++) {
      bm[y * GLYPH_SIZE + x] = BAYER4[(y % 4) * 4 + (x % 4)] < threshold ? 1 : 0;
    }
  }
  return bm;
}

/**
 * A 2-pixel-thick corner bracket (the font has no box-drawing characters). `right` / `bottom` pick
 * which edges carry the stroke: ┌ is (false, false), ┘ is (true, true).
 */
function cornerBitmap(right: boolean, bottom: boolean): Bitmap {
  const bm = emptyBitmap();
  const edgeX = right ? [GLYPH_SIZE - 2, GLYPH_SIZE - 1] : [0, 1];
  const edgeY = bottom ? [GLYPH_SIZE - 2, GLYPH_SIZE - 1] : [0, 1];
  for (let y = 0; y < GLYPH_SIZE; y++) {
    for (let x = 0; x < GLYPH_SIZE; x++) {
      const armX = edgeY.includes(y) && (right ? x >= 2 : x < GLYPH_SIZE - 2);
      const armY = edgeX.includes(x) && (bottom ? y >= 2 : y < GLYPH_SIZE - 2);
      bm[y * GLYPH_SIZE + x] = armX || armY ? 1 : 0;
    }
  }
  return bm;
}

/** Block characters are drawn procedurally so they are pixel-perfect whatever the font has. */
export const PROCEDURAL_GLYPHS: Record<string, () => Bitmap> = {
  ' ': emptyBitmap,
  '░': () => ditherBitmap(0.25),
  '▒': () => ditherBitmap(0.5),
  '▓': () => ditherBitmap(0.75),
  '█': () => ditherBitmap(1),
  '┌': () => cornerBitmap(false, false),
  '┐': () => cornerBitmap(true, false),
  '└': () => cornerBitmap(false, true),
  '┘': () => cornerBitmap(true, true),
};

export interface Box {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

/** Bounding box of pixels whose alpha ≥ threshold in an RGBA buffer, or null if empty. */
export function inkBox(rgba: Uint8ClampedArray, width: number, height: number, threshold = 128) {
  let box: Box | null = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] < threshold) continue;
      if (!box) box = { x0: x, y0: y, x1: x + 1, y1: y + 1 };
      else {
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x + 1);
        box.y1 = Math.max(box.y1, y + 1);
      }
    }
  }
  return box;
}

export function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

/** The GLYPH_SIZE² window to crop: anchored at the ink box, centred if the ink is larger. */
export function cropWindow(ink: Box): { x: number; y: number } {
  const w = ink.x1 - ink.x0;
  const h = ink.y1 - ink.y0;
  return {
    x:
      ink.x0 +
      Math.floor(Math.max(0, w - GLYPH_SIZE) / 2) -
      Math.floor(Math.max(0, GLYPH_SIZE - w) / 2),
    y:
      ink.y0 +
      Math.floor(Math.max(0, h - GLYPH_SIZE) / 2) -
      Math.floor(Math.max(0, GLYPH_SIZE - h) / 2),
  };
}

/**
 * Crops an 8×8 window out of an RGBA buffer and thresholds alpha to one bit per pixel.
 * With `step` > 1 the source is drawn `step`× larger and each glyph pixel is read at the centre of
 * its step×step block, which makes the result immune to sub-pixel font positioning.
 */
export function cropThreshold(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  originX: number,
  originY: number,
  threshold = 128,
  step = 1,
): Bitmap {
  const half = Math.floor(step / 2);
  const bm = emptyBitmap();
  for (let y = 0; y < GLYPH_SIZE; y++) {
    for (let x = 0; x < GLYPH_SIZE; x++) {
      const sx = originX + x * step + half;
      const sy = originY + y * step + half;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      bm[y * GLYPH_SIZE + x] = rgba[(sy * width + sx) * 4 + 3] >= threshold ? 1 : 0;
    }
  }
  return bm;
}
