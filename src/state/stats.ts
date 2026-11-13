import { createStore } from 'zustand/vanilla';

/** Renderer → UI telemetry. The engine writes this a few times per second, never per frame. */
export interface Stats {
  fps: number;
  /** Camera distance from the black hole, in Schwarzschild radii. */
  distance: number;
  /** Inclination: angle between the view direction and the disk normal, in degrees. */
  inclination: number;
  sceneWidth: number;
  sceneHeight: number;
  /** Character grid (0 × 0 when ASCII is off). */
  cols: number;
  rows: number;
  glyphScale: number;
  /** Attract-mode orbit is running. */
  attract: boolean;
  /** Current ray-march step budget. */
  steps: number;
  /** First frame with the real glyph font has been drawn (the boot screen waits for this). */
  ready: boolean;
}

export const statsStore = createStore<Stats>()(() => ({
  fps: 0,
  distance: 0,
  inclination: 0,
  sceneWidth: 0,
  sceneHeight: 0,
  cols: 0,
  rows: 0,
  glyphScale: 0,
  attract: false,
  steps: 0,
  ready: false,
}));
