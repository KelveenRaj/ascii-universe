import { createStore } from 'zustand/vanilla';
import type { SceneId } from '@/scenes/registry';

/** A place in the targets list. */
export interface WorldTargetRow {
  id: string;
  name: string;
  /** What it is, e.g. 'G-CLASS STAR, 3 PLANETS'. */
  kind: string;
  /** Distance, formatted, e.g. '12 LY'. */
  dist: string;
  selected: boolean;
}

/** The open world's readout for the React overlay, written by the engine when it changes. */
export interface WorldHud {
  /** Readout rows, e.g. [['SPEED', '20 LY/S']]. */
  rows: Array<[string, string]>;
  /** One line of control hints. */
  hint: string;
  /** A short notice (a discovery, a jump), or null. */
  message: string | null;
  /** Places nearby you can pick as a target. */
  targets: WorldTargetRow[];
  /** Whether J would jump now (a target is set and you're not already there or jumping). */
  canJump: boolean;
}

/** Something the overlay asks the flight to do; the engine takes it on its next frame. */
export type WorldRequest = { type: 'target'; id: string } | { type: 'jump' };

export interface WorldState {
  /** The scene rendering the layer the ship is in (the galaxy for now; systems and landmarks later). */
  sceneId: SceneId;
  hud: WorldHud | null;
  requests: WorldRequest[];
  request(r: WorldRequest): void;
  /** Returns and clears the pending requests. */
  takeRequests(): WorldRequest[];
}

export const worldStore = createStore<WorldState>()((set, get) => ({
  sceneId: 'world-galaxy',
  hud: null,
  requests: [],
  request: (r) => set({ requests: [...get().requests, r] }),
  takeRequests: () => {
    const out = get().requests;
    if (out.length) set({ requests: [] });
    return out;
  },
}));
