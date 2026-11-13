import { createStore } from 'zustand/vanilla';
import type { PaletteId } from '../renderer/palette/palettes';

/**
 * Render settings. React writes here (settings panel, M5); the render loop reads
 * `settingsStore.getState()` every frame without subscribing, so it never causes React renders.
 */

export const DEBUG_VIEWS = ['final', 'intensity', 'redshift', 'steps'] as const;
export type DebugView = (typeof DEBUG_VIEWS)[number];

export interface Settings {
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
  palette: 'eht',
  exposure: 2.2,
  diskSpeed: 6,
  beaming: 3,
  diskInner: 3,
  diskOuter: 12,
  starDensity: 0.5,
  maxSteps: 300,
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
