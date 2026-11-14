/**
 * Colour ramps over tonemapped brightness t ∈ [0, 1], and the palette modes that pick them.
 *
 * Every cell of the scene buffer names a material (a row in the palette texture). Each material has
 * its own ramp, e.g. the black hole's EHT-style disk. In the default "natural" mode every material
 * uses its own ramp, so a blue planet and an orange star can share the screen. The terminal modes
 * (green phosphor, amber, mono, afmhot) recolour every material with one ramp for the classic
 * single-colour look.
 */

/** A 1D colour map from "how bright" to "what colour". */
export interface Ramp {
  /** [t, '#rrggbb'] pairs, t strictly increasing from 0 to 1. */
  stops: ReadonlyArray<readonly [number, string]>;
  /** 'linear' blends in linear light (smoother for photographic ramps); 'srgb' blends display values. */
  interpolation: 'linear' | 'srgb';
}

/** Something a scene paints with, e.g. "accretion disk" or "ocean". */
export interface Material {
  id: string;
  label: string;
  ramp: Ramp;
}

/** Star colour and empty-sky colour. Void cells (e.g. a black hole's shadow) are always #000000. */
export interface Sky {
  /** Kept dim so stars never compete with the scene. */
  starTint: string;
  background: string;
}

export type PaletteId = 'natural' | 'afmhot' | 'green' | 'amber' | 'mono';

export interface Palette {
  id: PaletteId;
  label: string;
  /** One ramp for every material, or null for natural colours (each material's own ramp). */
  ramp: Ramp | null;
  /** Overrides the scene's sky; null keeps it. */
  sky: Sky | null;
}

export const PALETTES: Record<PaletteId, Palette> = {
  natural: { id: 'natural', label: 'Natural', ramp: null, sky: null },
  afmhot: {
    id: 'afmhot',
    label: 'afmhot',
    // matplotlib afmhot: r = 2t, g = 2t - 0.5, b = 2t - 1 (clamped), piecewise linear in display space
    ramp: {
      stops: [
        [0.0, '#000000'],
        [0.25, '#800000'],
        [0.5, '#FF8000'],
        [0.75, '#FFFF80'],
        [1.0, '#FFFFFF'],
      ],
      interpolation: 'srgb',
    },
    sky: { starTint: '#A0A0A0', background: '#050302' },
  },
  green: {
    id: 'green',
    label: 'P1 green',
    ramp: {
      stops: [
        [0.0, '#000000'],
        [0.2, '#002A0A'],
        [0.5, '#0B7A2A'],
        [0.8, '#33FF66'],
        [1.0, '#CCFFD9'],
      ],
      interpolation: 'linear',
    },
    sky: { starTint: '#1F9E45', background: '#010401' },
  },
  amber: {
    id: 'amber',
    label: 'P3 amber',
    ramp: {
      stops: [
        [0.0, '#000000'],
        [0.2, '#2A1400'],
        [0.5, '#8A4F00'],
        [0.8, '#FFB000'],
        [1.0, '#FFE6B3'],
      ],
      interpolation: 'linear',
    },
    sky: { starTint: '#A86F12', background: '#040200' },
  },
  mono: {
    id: 'mono',
    label: 'Mono',
    ramp: {
      stops: [
        [0.0, '#000000'],
        [0.3, '#3A3A3A'],
        [0.7, '#BDBDBD'],
        [1.0, '#FFFFFF'],
      ],
      interpolation: 'linear',
    },
    sky: { starTint: '#8A8A8A', background: '#030303' },
  },
};

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

/** Saved palette ids that no longer exist → what they became. */
export const LEGACY_PALETTE_IDS: Record<string, PaletteId> = {
  // v1 'eht' was the black hole's colours; that's now its disk material under natural colours
  eht: 'natural',
};

/** What the display actually draws with: one ramp per material row, plus the sky. */
export interface ResolvedColors {
  ramps: Ramp[];
  sky: Sky;
}

/** Combines the palette mode with the scene's own materials and sky. */
export function resolveColors(
  palette: Palette,
  scene: { materials: readonly Material[]; sky: Sky },
): ResolvedColors {
  const ramps = scene.materials.map((m) => palette.ramp ?? m.ramp);
  return { ramps, sky: palette.sky ?? scene.sky };
}
