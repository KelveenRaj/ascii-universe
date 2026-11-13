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
}

export const statsStore = createStore<Stats>()(() => ({
  fps: 0,
  distance: 0,
  inclination: 0,
  sceneWidth: 0,
  sceneHeight: 0,
}));
