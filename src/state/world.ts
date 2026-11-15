import { createStore } from 'zustand/vanilla';
import type { SceneId } from '@/scenes/registry';

/** The open world's readout for the React overlay, written by the engine when it changes. */
export interface WorldHud {
  /** Readout rows, e.g. [['SPEED', '20 LY/S']]. */
  rows: Array<[string, string]>;
  /** One line of control hints. */
  hint: string;
}

export interface WorldState {
  /** The scene rendering the layer the ship is in (the galaxy for now; systems and landmarks later). */
  sceneId: SceneId;
  hud: WorldHud | null;
}

export const worldStore = createStore<WorldState>()(() => ({
  sceneId: 'world-galaxy',
  hud: null,
}));
