import type { WorldFrame } from '@/engine/scene/SceneModule';
import type { SceneId } from '@/scenes/registry';
import { AU_KM, SOLAR_BODIES, type SolarBodyId } from '@/scenes/solar-system/bodies';
import { DAY_MS, startDate } from '@/scenes/solar-system/clock';
import { layoutAt } from '@/scenes/solar-system/layout';
import { SOLAR_SYSTEM_PARAMS } from '@/scenes/solar-system/params';
import type { ChaseRig } from '@/world/flight/ChaseCamera';
import type { FlightModel, FlightTuning } from '@/world/flight/FlightModel';
import {
  distance,
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
  readonly kind: 'landmark';
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
  /** How far a ship keeps out of the occluders, as a multiple of their radius (default 1.08). */
  readonly keepOutMargin?: number;
  /** Advances the layer's own clock (planets that move); `dt` is 0 while everything is held still. */
  tick?(dt: number): void;
  /**
   * Called each frame with the ship's position, for a layer whose scale follows where the ship is:
   * it may update its `tuning`, `rig` and `dustRadius` (the flight and chase camera hold the same
   * objects).
   */
  adapt?(pos: Vec3d): void;
  /** The speed readout, when the layer's own unit isn't enough (default: `speedUnit`). */
  formatSpeed?(speed: number): string;
  /** Things to target and jump between inside (planets). */
  targets(): Target[];
  sceneFrame(camPos: Vec3d): WorldFrame;
  occluders(): readonly Sphere[];
  /** Past the edge: time to go back to open space. */
  outside(pos: Vec3d): boolean;
  formatDistance(d: number): string;
  hudRows(pos: Vec3d): Array<[string, string]>;
  /** Catalog id of the real body the ship is in contact with right now. */
  contact(): string;
  /** The minimap's scope for this layer, with the bodies to plot (layer units, x and z). */
  map(): {
    scope: 'sol' | 'hole';
    extent: number;
    bodies: Array<{ id: string; name: string; x: number; z: number }>;
  };
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

const LIGHT_KMS = 299792.458;
const SOL_EDGE = 4.5;
/** Half the width of the Solar System minimap (layer units). */
export const SOL_MAP_EXTENT = SOL_EDGE;
const SOL_SPAWN = 4.2;
/** The scale unit never exceeds this far out in open space (au, squeezed). */
const SOL_SCALE_MAX = 0.15;
/** Exposure follows a body once the ship is within this many of its radii of the surface. */
const SOL_FOCUS_RADII = 12;
const SOL_CONTACT_RADII = 8;
const SOL_DAYS_PER_S = SOLAR_SYSTEM_PARAMS.timeRate.default;

/** "123,456 KM" or "1.23 AU", the way the Solar System scene reads out altitude. */
function solarDistance(au: number): string {
  const km = au * AU_KM;
  return km < 1e7 ? `${Math.round(km).toLocaleString('en-US')} KM` : `${au.toFixed(2)} AU`;
}

/**
 * Sol: the real Solar System, flown through. Units are au, squeezed the way the explore scene's
 * log-distance layout does (sizes true, distances not), with the Sun at the origin; the scene is
 * the explore one (SolarSystemPass), told the date and where you are. The planets keep their real
 * dates and spins.
 *
 * The range between a planet's surface and Neptune's orbit is six orders of magnitude, so the
 * layer's scale follows the ship: speed, camera distance and the specks around you are all set by
 * how far you are from the nearest body, which makes an approach slow down on its own.
 */
export class SolarLayer implements InnerLayer {
  readonly kind = 'landmark';
  readonly sceneId = 'solar-system';
  readonly tuning: FlightTuning = {
    cruise: 2.5 * SOL_SCALE_MAX,
    boost: 8,
    response: 1.6,
    turnRate: 1.3,
    rollRate: 2.2,
  };
  readonly rig: ChaseRig = {
    back: 0.5 * SOL_SCALE_MAX,
    up: 0.15 * SOL_SCALE_MAX,
    ahead: 1.25 * SOL_SCALE_MAX,
  };
  readonly keepOutMargin = 1.4;
  readonly speedUnit = 'AU/S';
  readonly exitKly = 0.003;
  readonly place: Target;
  private readonly start = startDate();
  private days = 0;
  private scaleUnit = SOL_SCALE_MAX;
  private near: { id: SolarBodyId; name: string; alt: number; radius: number } | null = null;
  private readonly bodyTargets: Target[];
  private readonly spheres: Sphere[];

  constructor(place: Target) {
    this.place = place;
    this.bodyTargets = SOLAR_BODIES.map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.id === 'sun' ? 'G2 STAR' : b.id === 'moon' ? 'MOON' : 'PLANET',
      pos: [0, 0, 0] as Vec3d,
      lum: 0,
      material: 0,
    }));
    this.spheres = SOLAR_BODIES.map(() => ({ pos: [0, 0, 0] as Vec3d, radius: 0 }));
    this.placeBodies();
  }

  /** The date now (ms since the epoch). */
  get time(): number {
    return this.start.getTime() + this.days * DAY_MS;
  }

  /** Puts every body where it is on the current date. */
  private placeBodies(): void {
    const placed = layoutAt(new Date(this.time), false);
    for (const b of SOLAR_BODIES) {
      const pb = placed[b.id];
      this.bodyTargets[b.index].pos = pb.pos;
      this.spheres[b.index].pos = pb.pos;
      this.spheres[b.index].radius = pb.radius;
    }
  }

  tick(dt: number): void {
    if (dt <= 0) return;
    this.days += dt * SOL_DAYS_PER_S;
    this.placeBodies();
  }

  adapt(pos: Vec3d): void {
    let near: SolarLayer['near'] = null;
    for (const b of SOLAR_BODIES) {
      const s = this.spheres[b.index];
      const alt = Math.max(0, distance(pos, s.pos) - s.radius);
      if (!near || alt < near.alt) near = { id: b.id, name: b.name, alt, radius: s.radius };
    }
    this.near = near;
    const u = near ? Math.min(SOL_SCALE_MAX, near.alt + 0.5 * near.radius) : SOL_SCALE_MAX;
    this.scaleUnit = u;
    this.tuning.cruise = 2.5 * u;
    this.rig.back = 0.5 * u;
    this.rig.up = 0.15 * u;
    this.rig.ahead = 1.25 * u;
  }

  get dustRadius(): number {
    return 3.75 * this.scaleUnit;
  }

  /**
   * A spot a few radii out from `id`, on the side facing the Sun and a little above the plane,
   * looking at it (so Saturn's rings show). Null for an unknown body.
   */
  placeNear(id: string): { pos: Vec3d; orient: Quat } | null {
    const i = SOLAR_BODIES.findIndex((b) => b.id === id);
    if (i < 0) return null;
    const s = this.spheres[i];
    // on the Sun's side, so the body (and Saturn's rings) are lit
    const outward: Vec3d = length(s.pos) > 1e-9 ? normalize(s.pos) : [0, 0, 1];
    const toward: Vec3d = id === 'sun' ? outward : scale(outward, -1);
    const dir = normalize(add(toward, [0, id === 'sun' ? 0.2 : 0.35, 0]));
    const pos = add(s.pos, scale(dir, s.radius * (id === 'sun' ? 6 : 5)));
    return { pos, orient: quatLookAt(scale(dir, -1), UP) };
  }

  spawn(from: Vec3d): { pos: Vec3d; orient: Quat } {
    // outside Neptune's orbit, a little above the plane, looking at the Sun
    const dir = normalize(add(normalize(from), [0, 0.12, 0]));
    return { pos: scale(dir, SOL_SPAWN), orient: quatLookAt(scale(dir, -1), UP) };
  }

  targets(): Target[] {
    return this.bodyTargets;
  }

  /** A body's radius (au), for framing its target. */
  radiusOf(id: string): number {
    return this.spheres[SOLAR_BODIES.findIndex((b) => b.id === id)]?.radius ?? 0;
  }

  sceneFrame(): WorldFrame {
    const near = this.near;
    const focus = near && near.alt < near.radius * SOL_FOCUS_RADII ? near.id : null;
    return { stars: [], solar: { time: this.time, focus } };
  }

  occluders(): readonly Sphere[] {
    return this.spheres;
  }

  outside(pos: Vec3d): boolean {
    return length(pos) > SOL_EDGE;
  }

  formatDistance(d: number): string {
    return solarDistance(d);
  }

  /** Real speed: km/s, or in light-speeds once it's past the speed of light. */
  formatSpeed(speed: number): string {
    const kms = speed * AU_KM;
    if (kms < 0.5) return '0 KM/S';
    if (kms < LIGHT_KMS) return `${Math.round(kms).toLocaleString('en-US')} KM/S`;
    const c = kms / LIGHT_KMS;
    return `${c.toFixed(c < 10 ? 1 : 0)} C`;
  }

  /** Within this many radii of a surface counts as contact with that body. */
  contact(): string {
    const near = this.near;
    return near && near.alt < near.radius * SOL_CONTACT_RADII ? near.id : 'solar-system';
  }

  map() {
    const bodies = SOLAR_BODIES.filter((b) => b.id !== 'moon').map((b) => {
      const pos = this.bodyTargets[b.index].pos;
      return { id: b.id, name: b.name, x: pos[0], z: pos[2] };
    });
    return { scope: 'sol' as const, extent: SOL_EDGE, bodies };
  }

  hudRows(): Array<[string, string]> {
    const near = this.near;
    return [
      ['NEAR', near ? near.name : '-'],
      ['ALT', near ? solarDistance(near.alt) : '-'],
      ['DATE', new Date(this.time).toISOString().slice(0, 10)],
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

  contact(): string {
    return 'sgr-a-star';
  }

  map() {
    return { scope: 'hole' as const, extent: HOLE_EDGE, bodies: [] };
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
