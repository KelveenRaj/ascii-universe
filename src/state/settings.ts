import { createStore } from 'zustand/vanilla';
import type { RampId } from '../renderer/glyphs/ramps';
import type { PaletteId } from '../renderer/palette/palettes';

/**
 * Render settings. React writes here (settings panel, M5); the render loop reads
 * `settingsStore.getState()` every frame without subscribing, so it never causes React renders.
 */

export const DEBUG_VIEWS = ['final', 'intensity', 'redshift', 'steps'] as const;
export type DebugView = (typeof DEBUG_VIEWS)[number];

export interface Settings {
  /** false shows the smooth (non-ASCII) render, handy for comparison and debugging. */
  ascii: boolean;
  ramp: RampId;
  /** Glyph pixel size multiplier: 0 = auto (aims for ~120–160 columns), else 1..4. */
  glyphScale: number;
  /** Scene texels per cell edge: 2 = 2×2 supersampling (less shimmer), 1 = fastest. */
  supersample: 1 | 2;
  palette: PaletteId;
  /** Multiplies disk intensity before the 1 - e^(-x) tonemap. */
  exposure: number;
  /** Disk animation speed multiplier (1 = physical Keplerian rate in r_s/c units per second). */
  diskSpeed: number;
  /** Observed intensity ∝ g^beaming (g = Doppler × gravitational redshift). 4 is bolometric. */
  beaming: number;
  /** Disk inner/outer radius in Schwarzschild radii (ISCO = 3). */
  diskInner: number;
  diskOuter: number;
  /** 0..1 fraction of grid cells that hold a star. */
  starDensity: number;
  /** Upper bound on geodesic integration steps per ray. */
  maxSteps: number;
  /** Slow automatic orbit after 30 s without input, like an arcade attract screen. */
  attractMode: boolean;

  /** Phosphor glow around bright glyphs. */
  bloom: boolean;
  bloomStrength: number;
  /** Master switch for the CRT tube pass; the effects below only apply while it is on. */
  crt: boolean;
  curvature: boolean;
  curvatureAmount: number;
  scanlines: boolean;
  scanlineStrength: number;
  chromatic: boolean;
  chromaticAmount: number;
  vignette: boolean;
  vignetteStrength: number;
  phosphorMask: boolean;
  maskStrength: number;
  flicker: boolean;
  flickerAmount: number;

  debugView: DebugView;
  paused: boolean;
}

export interface SettingsActions {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
  cycleDebugView: () => void;
  togglePaused: () => void;
}

export type SettingsState = Settings & SettingsActions;

export const DEFAULT_SETTINGS: Settings = {
  ascii: true,
  ramp: 'classic',
  glyphScale: 0,
  supersample: 2,
  palette: 'eht',
  exposure: 2.2,
  diskSpeed: 6,
  beaming: 3,
  diskInner: 3,
  diskOuter: 12,
  starDensity: 0.3,
  maxSteps: 300,
  attractMode: true,
  bloom: true,
  bloomStrength: 0.55,
  crt: true,
  curvature: true,
  curvatureAmount: 0.5,
  scanlines: true,
  scanlineStrength: 0.5,
  chromatic: true,
  chromaticAmount: 0.4,
  vignette: true,
  vignetteStrength: 0.5,
  phosphorMask: false,
  maskStrength: 0.35,
  flicker: true,
  flickerAmount: 0.5,
  debugView: 'final',
  paused: false,
};

export const settingsStore = createStore<SettingsState>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  set: (key, value) => set({ [key]: value } as Partial<Settings>),
  reset: () => set(DEFAULT_SETTINGS),
  cycleDebugView: () => {
    const i = DEBUG_VIEWS.indexOf(get().debugView);
    set({ debugView: DEBUG_VIEWS[(i + 1) % DEBUG_VIEWS.length] });
  },
  togglePaused: () => set({ paused: !get().paused }),
}));

/** Effective CRT uniform strengths (0 = off), honouring the master switch and each toggle. */
export function crtStrengths(s: Settings) {
  const on = (flag: boolean, amount: number) => (s.crt && flag ? amount : 0);
  return {
    curvature: on(s.curvature, s.curvatureAmount),
    scanlines: on(s.scanlines, s.scanlineStrength),
    chromatic: on(s.chromatic, s.chromaticAmount),
    vignette: on(s.vignette, s.vignetteStrength),
    mask: on(s.phosphorMask, s.maskStrength),
    flicker: on(s.flicker, s.flickerAmount),
  };
}
export type CrtStrengths = ReturnType<typeof crtStrengths>;

export function anyCrtEffect(c: CrtStrengths): boolean {
  return Object.values(c).some((v) => v > 0);
}
