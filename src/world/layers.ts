import type { WorldFrame } from '@/engine/scene/SceneModule';
import type { SceneId } from '@/scenes/registry';
import type { ChaseRig } from '@/world/flight/ChaseCamera';
import type { FlightModel, FlightTuning } from '@/world/flight/FlightModel';
import { SYSTEM_MATERIAL, type PlanetKind, type SystemInterior } from '@/world/gen/planets';
import {
  dot,
  length,
  normalize,
  quatLookAt,
  scale,
  sub,
  add,
  type Quat,
  type Vec3d,
} from '@/world/math';
import type { Target } from '@/world/Neighbourhood';

/** Something the ship can't fly through, and that hides the ship when it's in the way. */
export interface Sphere {
  pos: Vec3d;
  radius: number;
}

/**
 * A layer you fly in after entering a place from open space: a star system, or a landmark with a
 * scene of its own (Sgr A*). Each has its own units; the galaxy layer is WorldHost's default.
 */
export interface InnerLayer {
  readonly kind: 'system' | 'landmark';
  readonly sceneId: SceneId;
  /** The place in open space this layer is the inside of. */
  readonly place: Target;
  readonly tuning: FlightTuning;
  readonly rig: ChaseRig;
  /** Radius of the specks around the ship (layer units). */
  readonly dustRadius: number;
  /** Speed unit for the HUD, e.g. 'SU/S'. */
  readonly speedUnit: string;
  /** How far out from the place you are, in open space, when you leave (kly). */
  readonly exitKly: number;
  /** Where you appear, coming in from `from` (unit vector from the place towards the ship). */
  spawn(from: Vec3d): { pos: Vec3d; orient: Quat };
  /** Things to target and jump between inside (planets). */
  targets(): Target[];
  sceneFrame(camPos: Vec3d): WorldFrame;
  occluders(): readonly Sphere[];
  /** Past the edge: time to go back to open space. */
  outside(pos: Vec3d): boolean;
  formatDistance(d: number): string;
  hudRows(pos: Vec3d): Array<[string, string]>;
}

const UP: Vec3d = [0, 1, 0];

/** Pushes the ship back out of any sphere it has flown into, and stops it moving further in. */
export function keepOut(flight: FlightModel, spheres: readonly Sphere[], margin = 1.08): void {
  for (const s of spheres) {
    const off = sub(flight.pos, s.pos);
    const d = length(off);
    const min = s.radius * margin;
    if (d >= min) continue;
    const n: Vec3d = d > 1e-12 ? scale(off, 1 / d) : UP;
    flight.pos = add(s.pos, scale(n, min));
    const inward = dot(flight.vel, n);
    if (inward < 0) flight.vel = sub(flight.vel, scale(n, inward));
  }
}

/** Does the segment from `a` to `b` pass through any of the spheres? */
export function blocked(a: Vec3d, b: Vec3d, spheres: readonly Sphere[]): boolean {
  const seg = sub(b, a);
  const len = length(seg);
  if (len < 1e-12) return false;
  const dir = scale(seg, 1 / len);
  for (const s of spheres) {
    const oc = sub(s.pos, a);
    const t = dot(oc, dir);
    if (t <= 0 || t >= len) continue;
    const perp2 = dot(oc, oc) - t * t;
    if (perp2 < s.radius * s.radius) return true;
  }
  return false;
}

const KIND_LABEL: Record<PlanetKind, string> = {
  rock: 'ROCKY PLANET',
  ocean: 'OCEAN WORLD',
  desert: 'DESERT PLANET',
  gas: 'GAS GIANT',
  ice: 'ICE GIANT',
  lava: 'LAVA WORLD',
};

const SYSTEM_TUNING: FlightTuning = {
  cruise: 2.5,
  boost: 8,
  response: 1.6,
  turnRate: 1.3,
  rollRate: 2.2,
};

/** A star system, in su, the star at the origin. */
export class SystemLayer implements InnerLayer {
  readonly kind = 'system';
  readonly sceneId = 'world-system';
  readonly tuning = SYSTEM_TUNING;
  readonly rig: ChaseRig = { back: 0.5, up: 0.15, ahead: 1.25 };
  readonly dustRadius = 3.75;
  readonly speedUnit = 'SU/S';
  readonly exitKly = 0.003;
  readonly place: Target;
  readonly interior: SystemInterior;
  private readonly planetTargets: Target[];
  private readonly spheres: Sphere[];

  constructor(place: Target, interior: SystemInterior) {
    this.place = place;
    this.interior = interior;
    this.planetTargets = interior.planets.map((p) => ({
      id: p.id,
      name: p.name,
      kind: `${KIND_LABEL[p.kind]}${p.ring ? ', RINGED' : ''}`,
      pos: p.pos,
      lum: 0,
      material: SYSTEM_MATERIAL[p.kind],
    }));
    this.spheres = [
      { pos: [0, 0, 0], radius: interior.starRadius },
      ...interior.planets.map((p) => ({ pos: p.pos, radius: p.radius })),
    ];
  }

  spawn(from: Vec3d): { pos: Vec3d; orient: Quat } {
    // just outside the outermost orbit, a little above the plane, looking at the star
    const dir = normalize(add(normalize(from), [0, 0.12, 0]));
    const pos = scale(dir, this.interior.edge - 3);
    return { pos, orient: quatLookAt(scale(dir, -1), UP) };
  }

  targets(): Target[] {
    return this.planetTargets;
  }

  sceneFrame(camPos: Vec3d): WorldFrame {
    const rel = (p: Vec3d) => sub(p, camPos) as [number, number, number];
    const i = this.interior;
    return {
      stars: [],
      system: {
        star: { rel: rel([0, 0, 0]), radius: i.starRadius, material: i.starMaterial, seed: 0 },
        planets: i.planets.map((p) => ({
          rel: rel(p.pos),
          radius: p.radius,
          material: SYSTEM_MATERIAL[p.kind],
          seed: p.seed,
          ring: p.ring ?? undefined,
        })),
      },
    };
  }

  occluders(): readonly Sphere[] {
    return this.spheres;
  }

  outside(pos: Vec3d): boolean {
    return length(pos) > this.interior.edge;
  }

  formatDistance(d: number): string {
    return `${d.toFixed(d < 10 ? 1 : 0)} SU`;
  }

  hudRows(pos: Vec3d): Array<[string, string]> {
    const i = this.interior;
    return [
      ['STAR', this.formatDistance(Math.max(0, length(pos) - i.starRadius))],
      ['PLANETS', String(i.planets.length)],
      ['EDGE', this.formatDistance(Math.max(0, i.edge - length(pos)))],
    ];
  }
}

const HOLE_TUNING: FlightTuning = {
  cruise: 5,
  boost: 6,
  response: 1.6,
  turnRate: 1.3,
  rollRate: 2.2,
};

/** The shadow's apparent radius is ~2.6 r_s; the ship keeps outside the photon sphere and more. */
const HOLE_KEEP_OUT = 4;
const HOLE_EDGE = 160;

/** Sgr A*, in Schwarzschild radii, the hole at the origin and its disk in the XZ plane. */
export class BlackHoleLayer implements InnerLayer {
  readonly kind = 'landmark';
  readonly sceneId = 'black-hole';
  readonly tuning = HOLE_TUNING;
  readonly rig: ChaseRig = { back: 1, up: 0.3, ahead: 2.5 };
  readonly dustRadius = 7.5;
  readonly speedUnit = 'RS/S';
  readonly exitKly = 0.035;
  readonly place: Target;
  private readonly spheres: Sphere[] = [{ pos: [0, 0, 0], radius: HOLE_KEEP_OUT }];

  constructor(place: Target) {
    this.place = place;
  }

  spawn(from: Vec3d): { pos: Vec3d; orient: Quat } {
    // from the side you came, a little above the disk: the classic edge-on view
    const flat = normalize([from[0], 0, from[2]]);
    const dir = normalize(add(length(flat) > 0.5 ? flat : [0, 0, 1], [0, 0.12, 0]));
    const pos = scale(dir, 48);
    return { pos, orient: quatLookAt(scale(dir, -1), UP) };
  }

  targets(): Target[] {
    return [];
  }

  sceneFrame(): WorldFrame {
    return { stars: [] };
  }

  occluders(): readonly Sphere[] {
    return this.spheres;
  }

  outside(pos: Vec3d): boolean {
    return length(pos) > HOLE_EDGE;
  }

  formatDistance(d: number): string {
    return `${d.toFixed(d < 10 ? 1 : 0)} RS`;
  }

  hudRows(pos: Vec3d): Array<[string, string]> {
    const r = length(pos);
    const incl = (Math.acos(Math.min(1, Math.abs(pos[1]) / Math.max(r, 1e-9))) * 180) / Math.PI;
    return [
      ['HOLE', this.formatDistance(r)],
      ['INCL', `${incl.toFixed(0)}°`],
      ['EDGE', this.formatDistance(Math.max(0, HOLE_EDGE - r))],
    ];
  }
}
