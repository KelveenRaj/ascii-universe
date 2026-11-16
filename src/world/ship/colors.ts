import { hexToRgb, type Rgb } from '@/engine/display/palette/lut';
import type { Material, Ramp } from '@/engine/display/palette/palettes';
import { TEXT_SWATCHES } from '@/engine/display/TextLayer';
import type { ShipColorId } from '@/world/ship/design';

/**
 * The ship's palette rows. The open world's scenes (galaxy, star system, Sgr A*) list these after
 * their own materials; ShipPass writes their row numbers into the scene buffer's B channel, and
 * the hull and glow rows are rewritten from your design (display.setMaterialRamp) whenever it
 * changes.
 */
export const SHIP_HULL = 'ship-hull';
export const SHIP_TRIM = 'ship-trim';
export const SHIP_GLOW = 'ship-glow';

const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
const mix = (a: Rgb, b: Rgb, f: number): Rgb => [
  a[0] + (b[0] - a[0]) * f,
  a[1] + (b[1] - a[1]) * f,
  a[2] + (b[2] - a[2]) * f,
];
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [1, 1, 1];

function swatch(id: ShipColorId): Rgb {
  return hexToRgb(TEXT_SWATCHES.find((s) => s.id === id)?.hex ?? TEXT_SWATCHES[0].hex);
}

/** The hull's ramp: shadowed shades of the ship's colour, the swatch itself in light, a pale highlight. */
export function hullRamp(color: ShipColorId): Ramp {
  const c = swatch(color);
  return {
    stops: [
      [0, '#000000'],
      [0.18, toHex(mix(BLACK, c, 0.2))],
      [0.45, toHex(mix(BLACK, c, 0.6))],
      [0.75, toHex(c)],
      [1, toHex(mix(c, WHITE, 0.65))],
    ],
    interpolation: 'linear',
  };
}

/** The engine glow's ramp, in the trail's colour, burning to white. */
export function glowRamp(color: ShipColorId): Ramp {
  const c = swatch(color);
  return {
    stops: [
      [0, '#000000'],
      [0.3, toHex(mix(BLACK, c, 0.45))],
      [0.6, toHex(c)],
      [0.85, toHex(mix(c, WHITE, 0.5))],
      [1, '#FFFFFF'],
    ],
    interpolation: 'linear',
  };
}

const TRIM_RAMP: Ramp = {
  stops: [
    [0, '#000000'],
    [0.2, '#16181D'],
    [0.5, '#4C525E'],
    [0.8, '#A0A8B6'],
    [1, '#EEF1F6'],
  ],
  interpolation: 'linear',
};

/** Defaults until a design is applied (the default ship: white, amber trail). */
export const SHIP_MATERIALS = [
  { id: SHIP_HULL, label: 'Your ship', ramp: hullRamp('white') },
  { id: SHIP_TRIM, label: 'Ship trim', ramp: TRIM_RAMP },
  { id: SHIP_GLOW, label: 'Engine glow', ramp: glowRamp('amber') },
] as const satisfies readonly Material[];
