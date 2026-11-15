import type { SystemId, WorldLocation } from '@/world/location';
import type { ShipDesign } from '@/world/ship/design';

/**
 * Everything the game remembers about a pilot. Saved in the browser for now (LocalProfileRepo) and
 * shaped so it can be PUT to a server later as-is (`/api/save/:playerId`, with `rev` for conflict
 * checks), the way guest-first browser games do it: you play at once under a random `playerId`,
 * and claiming a username or linking a sign-in comes later and just fills in `pilot.claimed`.
 *
 * Bump `schema` and add a step to migrate.ts for any change that isn't purely additive.
 */
export interface PilotProfileV1 {
  schema: 1;
  /** Random guest id (UUID). Never shown; the server's key for this save later. */
  playerId: string;
  /** Goes up by one on every successful save. A save names the rev it was based on. */
  rev: number;
  createdAt: string;
  updatedAt: string;
  pilot: {
    callsign: string;
    /** Set once the pilot claims a username on the server (not in v1). */
    claimed: null | { username: string };
  };
  ship: ShipDesign;
  /** Where the pilot last was, to resume there. */
  location: { loc: WorldLocation; savedAt: string } | null;
  discoveries: {
    /** First visit time (ISO) and visit count per star system. */
    systems: Record<SystemId, { first: string; visits: number }>;
    /** First visit time (ISO) per landmark id. */
    landmarks: Record<string, string>;
  };
  stats: {
    distanceLy: number;
    jumps: number;
    playSeconds: number;
  };
}

export type PilotProfile = PilotProfileV1;
export const PROFILE_SCHEMA = 1;
