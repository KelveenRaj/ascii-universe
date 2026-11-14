/**
 * Colormaps over tonemapped brightness t ∈ [0, 1].
 *
 * EHT images are false-colour maps of brightness temperature, not true colour, so every palette here
 * is a 1D map from "how bright" to "what colour". The EHT stops are approximations of the published
 * Sgr A* / M87* images (an afmhot-like black → red → orange → amber → pale yellow ramp).
 */
export type PaletteId = 'eht' | 'afmhot' | 'green' | 'amber' | 'mono';

export interface Palette {
  id: PaletteId;
  label: string;
  /** [t, '#rrggbb'] pairs, t strictly increasing from 0 to 1. */
  stops: ReadonlyArray<readonly [number, string]>;
  /** 'linear' blends in linear light (smoother for photographic ramps); 'srgb' blends display values. */
  interpolation: 'linear' | 'srgb';
  /** Colour for stars, kept dim so they never compete with the ring. */
  starTint: string;
  /** Empty sky. The shadow itself is always pure #000000. */
  background: string;
}

export const PALETTES: Record<PaletteId, Palette> = {
  eht: {
    id: 'eht',
    label: 'EHT Sgr A*',
    stops: [
      [0.0, '#000000'],
      [0.08, '#1A0602'],
      [0.18, '#4A0D02'],
      [0.32, '#8C1D04'],
      [0.46, '#C23B0A'],
      [0.6, '#E8660F'],
      [0.72, '#F7931E'],
      [0.84, '#FFC04D'],
      [0.93, '#FFE49A'],
      [1.0, '#FFF7E0'],
    ],
    interpolation: 'linear',
    starTint: '#9AA3B8',
    background: '#050302',
  },
  afmhot: {
    id: 'afmhot',
    label: 'afmhot',
    // matplotlib afmhot: r = 2t, g = 2t - 0.5, b = 2t - 1 (clamped), piecewise linear in display space
    stops: [
      [0.0, '#000000'],
      [0.25, '#800000'],
      [0.5, '#FF8000'],
      [0.75, '#FFFF80'],
      [1.0, '#FFFFFF'],
    ],
    interpolation: 'srgb',
    starTint: '#A0A0A0',
    background: '#050302',
  },
  green: {
    id: 'green',
    label: 'P1 green',
    stops: [
      [0.0, '#000000'],
      [0.2, '#002A0A'],
      [0.5, '#0B7A2A'],
      [0.8, '#33FF66'],
      [1.0, '#CCFFD9'],
    ],
    interpolation: 'linear',
    starTint: '#1F9E45',
    background: '#010401',
  },
  amber: {
    id: 'amber',
    label: 'P3 amber',
    stops: [
      [0.0, '#000000'],
      [0.2, '#2A1400'],
      [0.5, '#8A4F00'],
      [0.8, '#FFB000'],
      [1.0, '#FFE6B3'],
    ],
    interpolation: 'linear',
    starTint: '#A86F12',
    background: '#040200',
  },
  mono: {
    id: 'mono',
    label: 'Mono',
    stops: [
      [0.0, '#000000'],
      [0.3, '#3A3A3A'],
      [0.7, '#BDBDBD'],
      [1.0, '#FFFFFF'],
    ],
    interpolation: 'linear',
    starTint: '#8A8A8A',
    background: '#030303',
  },
};

export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];
