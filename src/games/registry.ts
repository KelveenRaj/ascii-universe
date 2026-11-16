import type { GameModule } from '@/engine/game/Game';

/** Every minigame, keyed by id. None for now: Slingshot is archived (git tag archive/pre-refine). */
export const GAMES: Record<string, GameModule> = {};

/** Lookup by an untrusted string (URL hash). */
export function findGame(id: string): GameModule | undefined {
  return Object.hasOwn(GAMES, id) ? GAMES[id] : undefined;
}

/** Games played at a body. */
export function gamesAt(bodyId: string): GameModule[] {
  return Object.values(GAMES).filter((g) => g.bodyId === bodyId);
}
