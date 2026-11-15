import { findSystem, GEN, type StarClass, type StarSystem } from '@/world/gen/sector';
import { findLandmark, type Landmark } from '@/world/landmarks';
import { parseSystemId } from '@/world/location';
import type { Vec3d } from '@/world/math';
import { hashInts, hashString, mulberry32, pick, type Rng } from '@/world/rng';

/**
 * The inside of a star system, in "su" (game AU): the star at the origin, planets on compressed
 * orbits with inflated sizes, so a whole system fits in a minute of flying and every planet is
 * worth a look. Planets hold still (no orbital motion), so they're where you left them.
 *
 * Generated from the system's id alone (version GEN, like the systems themselves); Sol is built
 * by hand.
 */

export const PLANET_KINDS = ['rock', 'ocean', 'desert', 'gas', 'ice', 'lava'] as const;
export type PlanetKind = (typeof PLANET_KINDS)[number];

/** Material index in the system scene for each star look and planet kind (see world-system/materials.ts). */
export const SYSTEM_MATERIAL = {
  starHot: 0,
  starSun: 1,
  starRed: 2,
  rock: 3,
  ocean: 4,
  desert: 5,
  gas: 6,
  ice: 7,
  lava: 8,
  ring: 9,
} as const;

export interface Planet {
  id: string;
  name: string;
  kind: PlanetKind;
  /** su */
  radius: number;
  pos: Vec3d;
  /** Ring plane normal and outer radius (su), or null. The inner edge is 1.35 × radius. */
  ring: { normal: Vec3d; outer: number } | null;
  /** Varies the surface pattern. */
  seed: number;
}

export interface SystemInterior {
  /** The system's id (a procedural id, or a landmark id). */
  id: string;
  name: string;
  /** Star radius (su). */
  starRadius: number;
  /** Material index of the star. */
  starMaterial: number;
  planets: Planet[];
  /** Fly further than this (su) from the star and you're back in open space. */
  edge: number;
}

const STAR_RADIUS: Record<StarClass, number> = {
  O: 1.3,
  B: 1.1,
  A: 0.85,
  F: 0.65,
  G: 0.55,
  K: 0.45,
  M: 0.32,
};

/** Galaxy-layer materials (0 gold, 1 blue, 2 red) → the system scene's star materials. */
const STAR_LOOK = [SYSTEM_MATERIAL.starSun, SYSTEM_MATERIAL.starHot, SYSTEM_MATERIAL.starRed];

const LETTERS = 'BCDEFGHI';
const DEG = Math.PI / 180;

const range = (r: Rng, lo: number, hi: number) => lo + (hi - lo) * r();

/** A point on an orbit of radius `a`, at angle `phase` (rad) and inclination `incl` (rad). */
function onOrbit(a: number, phase: number, incl: number): Vec3d {
  return [
    a * Math.cos(phase),
    a * Math.sin(phase) * Math.sin(incl),
    a * Math.sin(phase) * Math.cos(incl),
  ];
}

function ringFor(r: Rng, radius: number): Planet['ring'] {
  const tilt = range(r, 5, 30) * DEG;
  const spin = r() * Math.PI * 2;
  return {
    normal: [Math.sin(tilt) * Math.cos(spin), Math.cos(tilt), Math.sin(tilt) * Math.sin(spin)],
    outer: radius * range(r, 1.9, 2.4),
  };
}

/** What kind of planet sits at slot `i` of `n`, given how hot the star is (1 = Sun). */
function kindFor(r: Rng, i: number, n: number, lum: number): PlanetKind {
  // where the slot falls between scorched and frozen; brighter stars push everything outwards
  const warmth = (1 - i / Math.max(1, n)) * Math.min(2, 0.7 + 0.3 * Math.log10(1 + lum * 9));
  if (warmth > 1.05) return pick(r, ['lava', 'rock', 'desert'] as const);
  if (warmth > 0.75) return pick(r, ['rock', 'desert', 'ocean', 'ocean'] as const);
  if (warmth > 0.45) return pick(r, ['gas', 'gas', 'rock', 'ocean'] as const);
  return pick(r, ['gas', 'ice', 'ice'] as const);
}

function radiusFor(r: Rng, kind: PlanetKind): number {
  switch (kind) {
    case 'gas':
      return range(r, 0.4, 0.7);
    case 'ice':
      return range(r, 0.28, 0.42);
    default:
      return range(r, 0.12, 0.26);
  }
}

/** First orbit and spacing (su) around a star of this radius. */
const firstOrbit = (starRadius: number) => 2.2 + starRadius * 2;
const SPACING = 1.5;

function generate(
  id: string,
  name: string,
  seed: number,
  starRadius: number,
  starMaterial: number,
  count: number,
  lum: number,
): SystemInterior {
  const planets: Planet[] = [];
  let a = firstOrbit(starRadius);
  for (let i = 0; i < count; i++) {
    const r = mulberry32(hashInts(seed, i, 7));
    const kind = kindFor(r, i, count, lum);
    const radius = radiusFor(r, kind);
    const pos = onOrbit(a, r() * Math.PI * 2, range(r, -4, 4) * DEG);
    const ring = kind === 'gas' && r() < 0.45 ? ringFor(r, radius) : null;
    planets.push({
      id: `${id}/${i}`,
      name: `${name} ${LETTERS[i]}`,
      kind,
      radius,
      pos,
      ring,
      seed: r(),
    });
    a *= SPACING * range(r, 0.92, 1.08);
  }
  return { id, name, starRadius, starMaterial, planets, edge: edgeFor(starRadius, planets) };
}

const edgeFor = (starRadius: number, planets: readonly Planet[]) =>
  Math.max(starRadius * 8, ...planets.map((p) => Math.hypot(...p.pos) + 6), 12);

/** Inside a procedural system. */
export function systemInterior(system: StarSystem): SystemInterior {
  const parsed = parseSystemId(system.id);
  const seed = parsed
    ? hashInts(GEN, parsed.sector[0], parsed.sector[1], parsed.sector[2], parsed.index, 31)
    : hashString(system.id);
  const look = STAR_LOOK[system.material] ?? SYSTEM_MATERIAL.starSun;
  return generate(
    system.id,
    system.name,
    seed,
    STAR_RADIUS[system.starClass],
    look,
    system.planets,
    system.lum,
  );
}

/** Supergiants are drawn bigger than any procedural star. */
const LANDMARK_RADIUS: Record<string, number> = {
  sirius: 0.8,
  vega: 0.85,
  polaris: 2,
  betelgeuse: 3,
  rigel: 2.4,
  deneb: 2.6,
};

/** Inside a landmark star (Sol is hand-built; the others get a generated family). */
function landmarkInterior(l: Landmark): SystemInterior | null {
  if (l.id === 'sol') return SOL;
  if (l.id === 'sgr-a-star') return null;
  const starRadius = LANDMARK_RADIUS[l.id] ?? 0.6;
  const seed = hashString(l.id);
  const count = 1 + (seed % 5);
  const look = STAR_LOOK[l.material] ?? SYSTEM_MATERIAL.starSun;
  return generate(l.id, l.name, seed, starRadius, look, count, l.lum);
}

/** The inside of any star you can enter, by id; null for anything else (Sgr A*, a bad id). */
export function findInterior(id: string): SystemInterior | null {
  const landmark = findLandmark(id);
  if (landmark) return landmarkInterior(landmark);
  const system = findSystem(id);
  return system ? systemInterior(system) : null;
}

// ---- Sol, by hand ------------------------------------------------------------------------------

/** The Solar System: real order, kinds and relative sizes (squashed), compressed orbits. */
const SOL_PLANETS: Array<[string, PlanetKind, number, number, boolean]> = [
  // name, kind, radius (su), orbit angle (deg), rings
  ['MERCURY', 'rock', 0.1, 40, false],
  ['VENUS', 'desert', 0.2, 160, false],
  ['EARTH', 'ocean', 0.21, 250, false],
  ['MARS', 'lava', 0.14, 320, false],
  ['JUPITER', 'gas', 0.7, 80, false],
  ['SATURN', 'gas', 0.6, 200, true],
  ['URANUS', 'ice', 0.4, 290, false],
  ['NEPTUNE', 'ice', 0.38, 20, false],
];

const SOL: SystemInterior = (() => {
  const starRadius = STAR_RADIUS.G;
  let a = firstOrbit(starRadius);
  const planets = SOL_PLANETS.map(([name, kind, radius, deg, rings], i): Planet => {
    const pos = onOrbit(a, deg * DEG, (i % 2 ? 1.5 : -1) * DEG);
    a *= SPACING;
    return {
      id: `sol/${i}`,
      name,
      kind,
      radius,
      pos,
      ring: rings ? { normal: [0.38, 0.92, 0.1], outer: radius * 2.3 } : null,
      seed: (i + 1) / 9,
    };
  });
  return {
    id: 'sol',
    name: 'SOL',
    starRadius,
    starMaterial: SYSTEM_MATERIAL.starSun,
    planets,
    edge: edgeFor(starRadius, planets),
  };
})();
