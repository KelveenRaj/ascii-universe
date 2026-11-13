import { GLYPH_SIZE } from './glyphs/bitmaps';

export interface CharGrid {
  cols: number;
  rows: number;
  /** Glyph pixel multiplier actually used. */
  scale: number;
  /** Cell edge in drawing-buffer pixels. Always an integer multiple of the 8 px glyph. */
  cellPx: number;
  /** Leftover pixels split evenly around the grid so it sits centred. */
  offsetX: number;
  offsetY: number;
}

export const MAX_GLYPH_SCALE = 4;

/** Picks the glyph scale that lands around 120–160 columns for the given drawing-buffer width. */
export function autoGlyphScale(drawWidth: number): number {
  return Math.min(MAX_GLYPH_SCALE, Math.max(1, Math.round(drawWidth / 1280)));
}

/** Integer glyph scaling keeps every glyph pixel exactly `scale` device pixels wide. */
export function computeGrid(drawWidth: number, drawHeight: number, glyphScale: number): CharGrid {
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
