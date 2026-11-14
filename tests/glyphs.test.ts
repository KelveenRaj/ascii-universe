import { describe, expect, it } from 'vitest';
import {
  coverage,
  cropThreshold,
  cropWindow,
  ditherBitmap,
  GLYPH_SIZE,
  inkBox,
  PROCEDURAL_GLYPHS,
} from '@/engine/display/glyphs/bitmaps';
import { RAMP_IDS, RAMPS, sortByCoverage, uniqueChars } from '@/engine/display/glyphs/ramps';

describe('ramps', () => {
  for (const id of RAMP_IDS) {
    it(`${id}: starts with a space and has no duplicates`, () => {
      const chars = RAMPS[id].chars;
      expect(chars[0]).toBe(' ');
      expect(uniqueChars(chars).length).toBe([...chars].length);
    });
  }

  it('sorts by coverage, keeps the space first, and is stable on ties', () => {
    const cov: Record<string, number> = { ' ': 0, a: 0.5, b: 0.1, c: 0.5, d: 0.3 };
    expect(sortByCoverage([' ', 'a', 'b', 'c', 'd'], (ch) => cov[ch])).toEqual([
      ' ',
      'b',
      'd',
      'a',
      'c',
    ]);
  });
});

describe('glyph bitmaps', () => {
  it('dither blocks have the requested coverage', () => {
    for (const fill of [0, 0.25, 0.5, 0.75, 1]) {
      expect(coverage(ditherBitmap(fill))).toBeCloseTo(fill, 5);
    }
  });

  it('procedural block glyphs get denser from ░ to █', () => {
    const order = [' ', '░', '▒', '▓', '█'].map((ch) => coverage(PROCEDURAL_GLYPHS[ch]()));
    order.slice(1).forEach((c, i) => expect(c).toBeGreaterThan(order[i]));
  });

  // 12×12 RGBA image with a 3×4 block of ink at (5, 6)
  const W = 12;
  const H = 12;
  const img = new Uint8ClampedArray(W * H * 4);
  for (let y = 6; y < 10; y++) for (let x = 5; x < 8; x++) img[(y * W + x) * 4 + 3] = 255;
  img[(0 * W + 0) * 4 + 3] = 100; // faint pixel below the threshold

  it('finds the ink bounding box, ignoring faint pixels', () => {
    expect(inkBox(img, W, H)).toEqual({ x0: 5, y0: 6, x1: 8, y1: 10 });
    expect(inkBox(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });

  it('centres small ink inside the 8×8 crop window', () => {
    // ink is 3×4 → pad (8-3)/2 = 2 left, (8-4)/2 = 2 up
    expect(cropWindow({ x0: 5, y0: 6, x1: 8, y1: 10 })).toEqual({ x: 3, y: 4 });
    // ink exactly 8×8 → window at the ink origin
    expect(cropWindow({ x0: 2, y0: 3, x1: 10, y1: 11 })).toEqual({ x: 2, y: 3 });
  });

  it('crops and thresholds to a 1-bit 8×8 bitmap', () => {
    const bm = cropThreshold(img, W, H, 3, 4);
    expect(bm.length).toBe(GLYPH_SIZE * GLYPH_SIZE);
    expect(coverage(bm)).toBeCloseTo(12 / 64);
    expect(bm[2 * GLYPH_SIZE + 2]).toBe(1); // top-left of the ink block
    expect(bm[0]).toBe(0);
  });
});
