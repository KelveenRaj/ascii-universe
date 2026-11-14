import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import type { GameHud } from '@/engine/game/Game';

/** The running game's readout, written by the engine when it changes; null when no game runs. */
export interface GameState {
  hud: GameHud | null;
}

export const gameStore = createStore<GameState>()(() => ({ hud: null }));

export const HIGH_SCORES_KEY = 'ascii-universe:high-scores';

export interface HighScoreState {
  scores: Record<string, number>;
  /** Keeps `score` if it beats the saved best for `gameId`. Returns true if it did. */
  submit: (gameId: string, score: number) => boolean;
}

/** Best score per game, saved in the browser. */
export const highScoreStore = createStore<HighScoreState>()(
  persist(
    (set, get) => ({
      scores: {},
      submit: (gameId, score) => {
        if (!Number.isFinite(score) || score <= (get().scores[gameId] ?? 0)) return false;
        set({ scores: { ...get().scores, [gameId]: Math.round(score) } });
        return true;
      },
    }),
    {
      name: HIGH_SCORES_KEY,
      version: 1,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (s) => ({ scores: s.scores }),
      merge: (persisted, current) => {
        const raw = (persisted as { scores?: unknown } | undefined)?.scores;
        const scores: Record<string, number> = {};
        if (raw && typeof raw === 'object') {
          for (const [id, v] of Object.entries(raw)) {
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) scores[id] = Math.round(v);
          }
        }
        return { ...current, scores };
      },
    },
  ),
);
