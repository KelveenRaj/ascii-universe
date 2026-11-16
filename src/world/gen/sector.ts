import { formatSystemId, parseSystemId, type SystemId } from '@/world/location';
import { add, scale, type Vec3d } from '@/world/math';
import { density } from '@/world/gen/density';
import { densityG1 } from '@/world/gen/densityG1';
import { starName } from '@/world/gen/names';
import { hashInts, mulberry32, pickWeighted, randInt, type Rng } from '@/world/rng';

/**
 * The procedural galaxy, version 2. Space is cut into cubic sectors; each sector's star systems
 * come only from (GEN, sector coordinates), so everyone sees the same stars in the same places,
 * forever. Changing anything here that moves or renames systems needs a new GEN (and the old
 * generator kept for saved discoveries): ids carry it, see world/location.ts.
 */
export const GEN = 2;
/**
 * Every generator that ever shipped, by version: how crowded the galaxy is at a point. Version 1
 * used the old generic four-arm galaxy; version 2 the shape rebuilt from published models. Old
 * ids keep resolving with the generator they were made with.
 */
const GENERATORS: Record<number, (p: Vec3d) => number> = { 1: densityG1, 2: density };
/** Sector edge in kly (50 light-years). */
export const SECTOR = 0.05;
/** Systems per sector at the Sun's density. Real space has hundreds; these are the ones worth a visit. */
const SYSTEMS_AT_SUN = 3;
const MAX_PER_SECTOR = 12;

/** Spectral classes, hottest first. */
export const STAR_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const;
export type StarClass = (typeof STAR_CLASSES)[number];

/**
 * Per class: how common (skewed towards bright, interesting stars compared with real space, where
 * three in four are dim M dwarfs), luminosity relative to the Sun (used for how bright it looks,
 * squashed), and the material it's drawn with in the galaxy layer (0 old-star gold, 1 young-star
 * blue, 2 glowing-gas red).
 */
const CLASS_INFO: Record<StarClass, { weight: number; lum: number; material: number }> = {
  O: { weight: 0.6, lum: 50, material: 1 },
  B: { weight: 3, lum: 12, material: 1 },
  A: { weight: 7, lum: 4, material: 1 },
  F: { weight: 12, lum: 2, material: 0 },
  G: { weight: 18, lum: 1, material: 0 },
  K: { weight: 24, lum: 0.5, material: 0 },
  M: { weight: 35, lum: 0.2, material: 2 },
};
const WEIGHTS = STAR_CLASSES.map((c) => CLASS_INFO[c].weight);

export interface StarSystem {
  id: SystemId;
  name: string;
  /** Galaxy frame, kly. */
  pos: Vec3d;
  starClass: StarClass;
  /** Relative to the Sun. */
  lum: number;
  material: number;
  planets: number;
}

export type SectorCoord = readonly [number, number, number];

export const sectorOf = (p: Vec3d): SectorCoord => [
  Math.floor(p[0] / SECTOR),
  Math.floor(p[1] / SECTOR),
  Math.floor(p[2] / SECTOR),
];

/** A Poisson draw with mean `mean` (Knuth; fine for the small means here). */
function poisson(rng: Rng, mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rng();
  while (p > limit && k < MAX_PER_SECTOR) {
    k++;
    p *= rng();
  }
  return k;
}

/** The star systems in one sector, in a fixed order (index = their id's last part). */
export function sectorSystems(sector: SectorCoord, gen: number = GEN): StarSystem[] {
  const densityAt = GENERATORS[gen];
  if (!densityAt) return [];
  const rng = mulberry32(hashInts(gen, sector[0], sector[1], sector[2]));
  const corner = scale(sector as Vec3d, SECTOR);
  const centre = add(corner, [SECTOR / 2, SECTOR / 2, SECTOR / 2]);
  const count = poisson(rng, SYSTEMS_AT_SUN * densityAt(centre));
  const out: StarSystem[] = [];
  for (let i = 0; i < count; i++) {
    // each system draws from its own stream, so adding fields later can't shift its neighbours
    const r = mulberry32(hashInts(gen, sector[0], sector[1], sector[2], i));
    const pos = add(corner, [r() * SECTOR, r() * SECTOR, r() * SECTOR]);
    const starClass = STAR_CLASSES[pickWeighted(r, WEIGHTS)];
    const info = CLASS_INFO[starClass];
    out.push({
      id: formatSystemId(gen, sector, i),
      name: starName(r),
      pos,
      starClass,
      lum: info.lum * (0.6 + 0.8 * r()),
      material: info.material,
      planets: starClass === 'O' || starClass === 'B' ? randInt(r, 0, 3) : randInt(r, 0, 8),
    });
  }
  return out;
}

/**
 * Systems in the sectors around a point, cached: flying keeps asking about the same sectors.
 * `reach` sectors out in every direction (2 → a 5×5×5 block, ~125 light-years each way).
 */
export class SectorCache {
  private readonly cache = new Map<string, StarSystem[]>();
  private readonly limit: number;

  constructor(limit = 2048) {
    this.limit = limit;
  }

  get(sector: SectorCoord): StarSystem[] {
    const key = `${sector[0]},${sector[1]},${sector[2]}`;
    let systems = this.cache.get(key);
    if (systems) {
      // move to the back: Map keeps insertion order, so the front is the least recently used
      this.cache.delete(key);
    } else {
      systems = sectorSystems(sector);
      if (this.cache.size >= this.limit) this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(key, systems);
    return systems;
  }

  around(p: Vec3d, reach = 2): StarSystem[] {
    const [cx, cy, cz] = sectorOf(p);
    const out: StarSystem[] = [];
    for (let x = cx - reach; x <= cx + reach; x++) {
      for (let y = cy - reach; y <= cy + reach; y++) {
        for (let z = cz - reach; z <= cz + reach; z++) out.push(...this.get([x, y, z]));
      }
    }
    return out;
  }
}

/** The system with this id (from a save, say), regenerated; null if there's no such system. */
export function findSystem(id: SystemId): StarSystem | null {
  const parsed = parseSystemId(id);
  if (!parsed || !GENERATORS[parsed.gen]) return null;
  return sectorSystems(parsed.sector, parsed.gen)[parsed.index] ?? null;
}
