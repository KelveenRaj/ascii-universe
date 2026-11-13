import { describe, expect, it } from 'vitest';
import { buildLut, hexToRgb, LUT_SIZE, luminance, type Rgb } from '../src/renderer/palette/lut';
import { PALETTE_IDS, PALETTES } from '../src/renderer/palette/palettes';

const texel = (lut: Uint8Array, i: number): Rgb => [
  lut[i * 4] / 255,
  lut[i * 4 + 1] / 255,
  lut[i * 4 + 2] / 255,
];

describe('palette LUTs', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#FF8000')).toEqual([1, 128 / 255, 0]);
    expect(() => hexToRgb('nope')).toThrow();
  });

  for (const id of PALETTE_IDS) {
    const palette = PALETTES[id];

    it(`${id}: starts at pure black and ends at its last stop`, () => {
      const lut = buildLut(palette);
      expect(lut.length).toBe(LUT_SIZE * 4);
      expect(texel(lut, 0)).toEqual([0, 0, 0]);
      const last = hexToRgb(palette.stops[palette.stops.length - 1][1]);
      texel(lut, LUT_SIZE - 1).forEach((c, k) => expect(c).toBeCloseTo(last[k], 2));
    });

    it(`${id}: gets brighter monotonically`, () => {
      const lut = buildLut(palette);
      let prev = -1;
      for (let i = 0; i < LUT_SIZE; i++) {
        const y = luminance(texel(lut, i));
        expect(y).toBeGreaterThanOrEqual(prev - 1e-3); // allow 8-bit rounding jitter
        prev = y;
      }
    });

    it(`${id}: stops are ordered from t = 0 to t = 1`, () => {
      const ts = palette.stops.map(([t]) => t);
      expect(ts[0]).toBe(0);
      expect(ts[ts.length - 1]).toBe(1);
      ts.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(ts[i]));
    });
  }
});
