import { cleanName, DEFAULT_SHIP, sanitizeShip } from '@/world/ship/design';
import { isPlaceId, parseSystemId, sanitizeLocation } from '@/world/location';
import { PROFILE_SCHEMA, type PilotProfile } from '@/profile/schema';

export const CALLSIGN_MAX = 12;
const MAX_DISCOVERIES = 50_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // non-secure contexts (plain http on a LAN IP) have no randomUUID; this only has to be unique
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

/** A brand-new guest pilot. */
export function newProfile(now = new Date()): PilotProfile {
  const iso = now.toISOString();
  return {
    schema: PROFILE_SCHEMA,
    playerId: randomId(),
    rev: 0,
    createdAt: iso,
    updatedAt: iso,
    pilot: { callsign: '', claimed: null },
    ship: { ...DEFAULT_SHIP, trail: { ...DEFAULT_SHIP.trail } },
    location: null,
    discoveries: { systems: {}, landmarks: {} },
    stats: { distanceLy: 0, jumps: 0, playSeconds: 0 },
  };
}

const isIso = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * A profile from untrusted data (localStorage, later a server response), brought up to the current
 * schema, with anything malformed dropped or reset. Null if it isn't a profile at all (no usable
 * player id) or comes from a newer schema this build doesn't understand: the caller then keeps
 * whatever it has rather than overwrite a newer save.
 */
export function migrate(raw: unknown): PilotProfile | null {
  const r = obj(raw);
  const schema = r.schema;
  if (typeof schema !== 'number' || schema < 1 || schema > PROFILE_SCHEMA) return null;
  if (typeof r.playerId !== 'string' || !UUID.test(r.playerId)) return null;
  // (schema 1 is the first; future versions add `if (schema < N) r = stepN(r)` here)

  const fresh = newProfile();
  const pilot = obj(r.pilot);
  const claimed = obj(pilot.claimed);
  const discoveries = obj(r.discoveries);
  const stats = obj(r.stats);
  const location = obj(r.location);

  const systems: PilotProfile['discoveries']['systems'] = {};
  for (const [id, v] of Object.entries(obj(discoveries.systems)).slice(0, MAX_DISCOVERIES)) {
    const e = obj(v);
    if ((parseSystemId(id) || isPlaceId(id)) && isIso(e.first)) {
      systems[id] = { first: e.first, visits: Math.max(1, Math.floor(count(e.visits))) };
    }
  }
  const landmarks: PilotProfile['discoveries']['landmarks'] = {};
  for (const [id, first] of Object.entries(obj(discoveries.landmarks))) {
    if (isPlaceId(id) && isIso(first)) landmarks[id] = first;
  }
  const loc = sanitizeLocation(location.loc);

  return {
    schema: PROFILE_SCHEMA,
    playerId: r.playerId.toLowerCase(),
    rev: Math.floor(count(r.rev)),
    createdAt: isIso(r.createdAt) ? r.createdAt : fresh.createdAt,
    updatedAt: isIso(r.updatedAt) ? r.updatedAt : fresh.updatedAt,
    pilot: {
      callsign: cleanName(pilot.callsign, CALLSIGN_MAX),
      claimed:
        typeof claimed.username === 'string' && claimed.username.length > 0
          ? { username: claimed.username.slice(0, 32) }
          : null,
    },
    ship: sanitizeShip(r.ship),
    location: loc
      ? { loc, savedAt: isIso(location.savedAt) ? location.savedAt : fresh.updatedAt }
      : null,
    discoveries: { systems, landmarks },
    stats: {
      distanceLy: count(stats.distanceLy),
      jumps: Math.floor(count(stats.jumps)),
      playSeconds: count(stats.playSeconds),
    },
  };
}

/**
 * Two copies of the same pilot that diverged (two tabs, later two devices): keep `theirs` (the
 * stored/server copy wins, so nothing is overwritten blindly) but never lose a discovery or
 * progress made in `mine`. Stats take the larger value, since both copies only ever grow.
 */
export function mergeProfiles(theirs: PilotProfile, mine: PilotProfile): PilotProfile {
  const systems = { ...theirs.discoveries.systems };
  for (const [id, m] of Object.entries(mine.discoveries.systems)) {
    const t = systems[id];
    systems[id] = t
      ? { first: t.first < m.first ? t.first : m.first, visits: Math.max(t.visits, m.visits) }
      : m;
  }
  const landmarks = { ...theirs.discoveries.landmarks };
  for (const [id, first] of Object.entries(mine.discoveries.landmarks)) {
    const t = landmarks[id];
    landmarks[id] = t && t < first ? t : first;
  }
  return {
    ...theirs,
    discoveries: { systems, landmarks },
    stats: {
      distanceLy: Math.max(theirs.stats.distanceLy, mine.stats.distanceLy),
      jumps: Math.max(theirs.stats.jumps, mine.stats.jumps),
      playSeconds: Math.max(theirs.stats.playSeconds, mine.stats.playSeconds),
    },
  };
}
