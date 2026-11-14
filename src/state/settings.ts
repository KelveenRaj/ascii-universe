import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { RAMPS, type RampId } from '@/engine/display/glyphs/ramps';
import { LEGACY_PALETTE_IDS, PALETTES, type PaletteId } from '@/engine/display/palette/palettes';
import { deviceDefaults } from '@/state/deviceTier';
import { migrateLegacySceneParams, SETTINGS_KEY } from '@/state/legacySettings';

/**
 * Render settings. React writes here (settings panel); the render loop reads
 * `settingsStore.getState()` every frame without subscribing, so it never causes React renders.
 * Everything except the debug view and pause state is saved to localStorage.
 */

export const DEBUG_VIEWS = ['final', 'intensity', 'redshift', 'steps'] as const;
export type DebugView = (typeof DEBUG_VIEWS)[number];

export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra', 'auto'] as const;
export type Quality = (typeof QUALITY_LEVELS)[number];

/** Geodesic step budget per ray for each fixed quality level. */
export const QUALITY_STEPS: Record<Exclude<Quality, 'auto'>, number> = {
  low: 96,
  medium: 160,
  high: 300,
  ultra: 500,
};

export interface Settings {
  /** false shows the smooth (non-ASCII) render, handy for comparison and debugging. */
  ascii: boolean;
  ramp: RampId;
  /** Glyph pixel size multiplier: 0 = auto (aims for ~120–160 columns), else 1..4. */
  glyphScale: number;
  /** > 0 picks an exact column count instead (glyph pixels may then be uneven). */
  columns: number;
  /** Scene texels per cell edge: 2 = 2×2 supersampling (less shimmer), 1 = fastest. */
  supersample: 1 | 2;
  palette: PaletteId;
  /** Multiplies scene brightness before the 1 - e^(-x) tonemap. */
  exposure: number;
  /** Ray-march step budget; 'auto' lets the quality governor pick. */
  quality: Quality;
  /** Slow automatic orbit after 30 s without input, like an arcade attract screen. */
  attractMode: boolean;
  /** Show the corner HUD. */
  hud: boolean;

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

const BASE_DEFAULTS: Settings = {
  ascii: true,
  ramp: 'classic',
  glyphScale: 0,
  columns: 0,
  supersample: 2,
  palette: 'natural',
  exposure: 2.2,
  quality: 'auto',
  attractMode: true,
  hud: true,
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

/** Defaults, adjusted for touch devices (lighter starting point). */
export const DEFAULT_SETTINGS: Settings = { ...BASE_DEFAULTS, ...deviceDefaults() };

/** Settings typed exactly `number` (not literal unions like `supersample: 1 | 2`). */
type NumericKey = {
  [K in keyof Settings]: number extends Settings[K] ? K : never;
}[keyof Settings];

/** Valid range (and slider step) for every numeric setting. Saved values are clamped to these. */
export const NUMERIC_RANGES: Record<NumericKey, { min: number; max: number; step: number }> = {
  glyphScale: { min: 0, max: 4, step: 1 },
  columns: { min: 0, max: 400, step: 4 },
  exposure: { min: 0.3, max: 6, step: 0.1 },
  bloomStrength: { min: 0, max: 2, step: 0.05 },
  curvatureAmount: { min: 0, max: 1, step: 0.05 },
  scanlineStrength: { min: 0, max: 1, step: 0.05 },
  chromaticAmount: { min: 0, max: 1, step: 0.05 },
  vignetteStrength: { min: 0, max: 1, step: 0.05 },
  maskStrength: { min: 0, max: 1, step: 0.05 },
  flickerAmount: { min: 0, max: 1, step: 0.05 },
};

/** Session-only keys that are never saved. */
const TRANSIENT_KEYS = new Set<keyof Settings>(['debugView', 'paused']);

/** String settings and their allowed values. */
const ENUMS: Partial<Record<keyof Settings, readonly unknown[]>> = {
  ramp: Object.keys(RAMPS),
  palette: Object.keys(PALETTES),
  quality: QUALITY_LEVELS,
  supersample: [1, 2],
};

/**
 * Turns whatever was in localStorage into safe settings: unknown keys are dropped, values of the
 * wrong type or outside their allowed set are ignored, numbers are clamped to their range.
 */
export function sanitizeSettings(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    if (TRANSIENT_KEYS.has(key) || !(key in input)) continue;
    let value = input[key];
    // renamed palettes (v1 "eht" is now "natural")
    if (
      key === 'palette' &&
      typeof value === 'string' &&
      Object.hasOwn(LEGACY_PALETTE_IDS, value)
    ) {
      value = LEGACY_PALETTE_IDS[value];
    }
    const allowed = ENUMS[key];
    if (allowed) {
      if (allowed.includes(value)) out[key] = value;
    } else if (key in NUMERIC_RANGES) {
      const range = NUMERIC_RANGES[key as NumericKey];
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = Math.min(range.max, Math.max(range.min, value));
      }
    } else if (typeof value === typeof DEFAULT_SETTINGS[key]) {
      out[key] = value;
    }
  }
  return out as Partial<Settings>;
}

function persistedSlice(s: SettingsState): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    if (!TRANSIENT_KEYS.has(key)) out[key] = s[key];
  }
  return out as Partial<Settings>;
}

// must run before this store loads and drops the v1 black-hole keys it no longer knows
migrateLegacySceneParams();

export const settingsStore = createStore<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      reset: () => set(DEFAULT_SETTINGS),
      cycleDebugView: () => {
        const i = DEBUG_VIEWS.indexOf(get().debugView);
        set({ debugView: DEBUG_VIEWS[(i + 1) % DEBUG_VIEWS.length] });
      },
      togglePaused: () => set({ paused: !get().paused }),
    }),
    {
      name: SETTINGS_KEY,
      // v2: scene knobs (disk speed, beaming…) moved to scene params; see legacySettings.ts
      version: 2,
      // createJSONStorage returns undefined (persistence off) if localStorage is unavailable
      storage: createJSONStorage(() => window.localStorage),
      partialize: persistedSlice,
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
      // older or newer saved formats: keep only what still validates
      migrate: (persisted) => sanitizeSettings(persisted) as SettingsState,
    },
  ),
);

/** Step budget for a fixed quality level. For 'auto' the engine uses the governor's tier; this is just its starting value. */
export function stepsFor(quality: Quality): number {
  return quality === 'auto' ? QUALITY_STEPS.high : QUALITY_STEPS[quality];
}

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
