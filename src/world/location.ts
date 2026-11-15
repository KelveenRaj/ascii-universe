import { isFiniteVec, type Vec3d } from '@/world/math';

/**
 * Where something is in the open world. The universe spans too many orders of magnitude for one
 * coordinate space, so it is split into layers, each with its own units:
 *
 *   galaxy    kly, galactic centre at the origin, disk in the XZ plane (as the Milky Way scene)
 *   system    "su", game AU around one star system's star (orbits compressed, radii inflated)
 *   landmark  the landmark's own scene units (r_s for Sgr A*)
 *
 * Moving between layers is a hyperspace jump or a system entry/exit, played as a warp.
 */
export type WorldLocation =
  | { layer: 'galaxy'; pos: Vec3d }
  | { layer: 'system'; systemId: SystemId; pos: Vec3d }
  | { layer: 'landmark'; landmarkId: string; pos: Vec3d };

/**
 * A procedural star system: `g{generator}:{sx}.{sy}.{sz}:{index}`. The generator version is part of
 * the id, so changing the generator can never silently re-point saved discoveries at different
 * stars: a new generator gets a new version and old ids still resolve with the old one.
 */
export type SystemId = string;

const SYSTEM_ID = /^g(\d{1,3}):(-?\d{1,7})\.(-?\d{1,7})\.(-?\d{1,7}):(\d{1,4})$/;

export interface ParsedSystemId {
  gen: number;
  sector: Vec3d;
  index: number;
}

export function formatSystemId(gen: number, sector: Vec3d, index: number): SystemId {
  return `g${gen}:${sector[0]}.${sector[1]}.${sector[2]}:${index}`;
}

export function parseSystemId(id: string): ParsedSystemId | null {
  const m = SYSTEM_ID.exec(id);
  if (!m) return null;
  return {
    gen: Number(m[1]),
    sector: [Number(m[2]), Number(m[3]), Number(m[4])],
    index: Number(m[5]),
  };
}

/** Ids of hand-built places (landmarks, named systems): lowercase words joined by dashes. */
const PLACE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isPlaceId = (id: unknown): id is string =>
  typeof id === 'string' && id.length <= 48 && PLACE_ID.test(id);

/** A location read from untrusted data (a save), or null if it isn't a valid one. */
export function sanitizeLocation(raw: unknown): WorldLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isFiniteVec(r.pos)) return null;
  const pos: Vec3d = [r.pos[0], r.pos[1], r.pos[2]];
  switch (r.layer) {
    case 'galaxy':
      return { layer: 'galaxy', pos };
    case 'system':
      return typeof r.systemId === 'string' &&
        (parseSystemId(r.systemId) !== null || isPlaceId(r.systemId))
        ? { layer: 'system', systemId: r.systemId, pos }
        : null;
    case 'landmark':
      return isPlaceId(r.landmarkId) ? { layer: 'landmark', landmarkId: r.landmarkId, pos } : null;
    default:
      return null;
  }
}
