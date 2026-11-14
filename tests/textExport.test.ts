import { describe, expect, it } from 'vitest';
import { glyphIndicesToText } from '@/engine/display/textExport';

/** Builds an RGBA buffer the way WebGL returns it: bottom row first. */
function pixels(rowsTopFirst: number[][]): Uint8Array {
  const rows = [...rowsTopFirst].reverse();
  const cols = rows[0].length;
  const out = new Uint8Array(cols * rows.length * 4);
  rows.forEach((row, y) => row.forEach((v, x) => (out[(y * cols + x) * 4] = v)));
  return out;
}

describe('copy as text', () => {
  const glyphs = [' ', '.', ':', '@', '+'];

  it('flips rows so the top of the screen comes first', () => {
    const text = glyphIndicesToText(
      pixels([
        [3, 3],
        [1, 2],
      ]),
      2,
      2,
      glyphs,
    );
    expect(text).toBe('@@\n.:');
  });

  it('trims trailing spaces but keeps leading ones', () => {
    const text = glyphIndicesToText(
      pixels([
        [0, 0, 4, 0],
        [0, 0, 0, 0],
      ]),
      4,
      2,
      glyphs,
    );
    expect(text).toBe('  +\n');
  });

  it('maps unknown indices to spaces', () => {
    expect(glyphIndicesToText(pixels([[99, 3]]), 2, 1, glyphs)).toBe(' @');
  });
});
