import { describe, expect, it } from 'vitest';
import {
  buildLut,
  buildPaletteRows,
  hexToRgb,
  LUT_SIZE,
  luminance,
  type Rgb,
} from '@/engine/display/palette/lut';
import { PALETTE_IDS, PALETTES, resolveColors, type Ramp } from '@/engine/display/palette/palettes';
import { SCENES } from '@/scenes/registry';
import { sanitizeSettings } from '@/state/settings';

const texel = (lut: Uint8Array, i: number): Rgb => [
  lut[i * 4] / 255,
  lut[i * 4 + 1] / 255,
  lut[i * 4 + 2] / 255,
];

/** Every ramp the display can draw with: terminal palettes and every scene's materials. */
const RAMPS: Array<[string, Ramp]> = [
  ...PALETTE_IDS.flatMap((id): Array<[string, Ramp]> => {
    const ramp = PALETTES[id].ramp;
    return ramp ? [[`palette ${id}`, ramp]] : [];
  }),
  ...Object.values(SCENES).flatMap((scene) =>
    scene.materials.map((m): [string, Ramp] => [`${scene.id}/${m.id}`, m.ramp]),
  ),
];

describe('colour ramps', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#FF8000')).toEqual([1, 128 / 255, 0]);
    expect(() => hexToRgb('nope')).toThrow();
  });

  for (const [name, ramp] of RAMPS) {
    it(`${name}: starts at pure black and ends at its last stop`, () => {
      const lut = buildLut(ramp);
      expect(lut.length).toBe(LUT_SIZE * 4);
      expect(texel(lut, 0)).toEqual([0, 0, 0]);
      const last = hexToRgb(ramp.stops[ramp.stops.length - 1][1]);
      texel(lut, LUT_SIZE - 1).forEach((c, k) => expect(c).toBeCloseTo(last[k], 2));
    });

    it(`${name}: gets brighter monotonically`, () => {
      const lut = buildLut(ramp);
      let prev = -1;
      for (let i = 0; i < LUT_SIZE; i++) {
        const y = luminance(texel(lut, i));
        expect(y).toBeGreaterThanOrEqual(prev - 1e-3); // allow 8-bit rounding jitter
        prev = y;
      }
    });

    it(`${name}: stops are ordered from t = 0 to t = 1`, () => {
      const ts = ramp.stops.map(([t]) => t);
      expect(ts[0]).toBe(0);
      expect(ts[ts.length - 1]).toBe(1);
      ts.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(ts[i]));
    });
  }
});

describe('palette rows', () => {
  const a = PALETTES.green.ramp!;
  const b = PALETTES.amber.ramp!;

  it('stacks one LUT per material, in order', () => {
    const rows = buildPaletteRows([a, b]);
    expect(rows.length).toBe(2 * LUT_SIZE * 4);
    expect(rows.subarray(0, LUT_SIZE * 4)).toEqual(buildLut(a));
    expect(rows.subarray(LUT_SIZE * 4)).toEqual(buildLut(b));
  });

  const scene = {
    materials: [
      { id: 'one', label: 'One', ramp: a },
      { id: 'two', label: 'Two', ramp: b },
    ],
    sky: { starTint: '#111111', background: '#222222' },
  };

  it('natural colours use each material’s own ramp and the scene sky', () => {
    expect(resolveColors(PALETTES.natural, scene)).toEqual({ ramps: [a, b], sky: scene.sky });
  });

  it('terminal palettes recolour every material and replace the sky', () => {
    const mono = PALETTES.mono;
    expect(resolveColors(mono, scene)).toEqual({ ramps: [mono.ramp, mono.ramp], sky: mono.sky });
  });

  it('every terminal palette has a ramp and a sky; natural has neither', () => {
    for (const id of PALETTE_IDS) {
      const p = PALETTES[id];
      expect(p.ramp === null, id).toBe(id === 'natural');
      expect(p.sky === null, id).toBe(id === 'natural');
    }
  });

  it('every scene has at least one material and a valid sky', () => {
    for (const s of Object.values(SCENES)) {
      expect(s.materials.length, s.id).toBeGreaterThan(0);
      expect(() => hexToRgb(s.sky.starTint)).not.toThrow();
      expect(() => hexToRgb(s.sky.background)).not.toThrow();
    }
  });
});

describe('saved palettes', () => {
  it('maps the old "eht" palette to natural colours', () => {
    expect(sanitizeSettings({ palette: 'eht' })).toEqual({ palette: 'natural' });
  });

  it('does not treat inherited object keys as legacy ids', () => {
    expect(sanitizeSettings({ palette: 'constructor' })).toEqual({});
  });
});
