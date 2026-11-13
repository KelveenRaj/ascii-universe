/**
 * Turns read-back glyph indices (RGBA8, R = atlas index, bottom row first as WebGL returns it)
 * into lines of text, top row first. Trailing spaces are trimmed; leading ones keep the shape.
 */
export function glyphIndicesToText(
  rgba: Uint8Array,
  cols: number,
  rows: number,
  glyphs: readonly string[],
): string {
  const lines: string[] = [];
  for (let y = rows - 1; y >= 0; y--) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      line += glyphs[rgba[(y * cols + x) * 4]] ?? ' ';
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n');
}
