import { GLYPH_SIZE } from '@/engine/display/glyphs/bitmaps';

export interface CharGrid {
  cols: number;
  rows: number;
  /** Device pixels per glyph pixel. A whole number unless an exact column count was requested. */
  scale: number;
  /** Cell edge in drawing-buffer pixels. */
  cellPx: number;
  /** Leftover pixels split evenly around the grid so it sits centred. */
  offsetX: number;
  offsetY: number;
}

export const MAX_GLYPH_SCALE = 4;
/** Smallest cell allowed in exact-columns mode (half a glyph pixel per device pixel). */
const MIN_FREE_CELL_PX = 4;

/** Picks the glyph scale that lands around 120–160 columns for the given drawing-buffer width. */
export function autoGlyphScale(drawWidth: number): number {
  return Math.min(MAX_GLYPH_SCALE, Math.max(1, Math.round(drawWidth / 1280)));
}

/**
 * Lays out the character grid.
 *
 * Normally cells are 8 × an integer scale, so every glyph pixel is exactly `scale` device pixels
 * (pixel-perfect). With `columns` > 0 the grid fits that many columns exactly instead, and glyph
 * pixels can come out uneven.
 */
export function computeGrid(
  drawWidth: number,
  drawHeight: number,
  glyphScale: number,
  columns = 0,
): CharGrid {
  if (columns > 0) {
    const cellPx = Math.max(MIN_FREE_CELL_PX, drawWidth / Math.round(columns));
    const cols = Math.max(1, Math.floor(drawWidth / cellPx + 1e-6));
    const rows = Math.max(1, Math.floor(drawHeight / cellPx));
    return {
      cols,
      rows,
      scale: cellPx / GLYPH_SIZE,
      cellPx,
      offsetX: Math.floor((drawWidth - cols * cellPx) / 2),
      offsetY: Math.floor((drawHeight - rows * cellPx) / 2),
    };
  }

  const scale =
    glyphScale > 0 ? Math.min(MAX_GLYPH_SCALE, Math.round(glyphScale)) : autoGlyphScale(drawWidth);
  const cellPx = GLYPH_SIZE * scale;
  const cols = Math.max(1, Math.floor(drawWidth / cellPx));
  const rows = Math.max(1, Math.floor(drawHeight / cellPx));
  return {
    cols,
    rows,
    scale,
    cellPx,
    offsetX: Math.floor((drawWidth - cols * cellPx) / 2),
    offsetY: Math.floor((drawHeight - rows * cellPx) / 2),
  };
}

/**
 * The cell under a drawing-buffer pixel (`x` from the left, `yTop` from the top), row 0 at the top
 * like the text layer, or null outside the grid. Mirrors ascii.frag, which works bottom-up.
 */
export function cellAt(
  grid: CharGrid,
  drawHeight: number,
  x: number,
  yTop: number,
): { col: number; row: number } | null {
  const col = Math.floor((x - grid.offsetX) / grid.cellPx);
  const rowFromBottom = Math.floor((drawHeight - yTop - grid.offsetY) / grid.cellPx);
  if (col < 0 || col >= grid.cols || rowFromBottom < 0 || rowFromBottom >= grid.rows) return null;
  return { col, row: grid.rows - 1 - rowFromBottom };
}
