import {
  AU_KM,
  SOLAR_BODIES,
  type SolarBody,
  type SolarBodyId,
} from '@/scenes/solar-system/bodies';
import { daysSinceJ2000, positionsAt, type Vec3 } from '@/scenes/solar-system/ephemeris';

/**
 * Turns real positions and spins into the scene: units are au, the ecliptic is the scene's XZ
 * plane and ecliptic north is +Y (ecliptic x, y, z → scene x, z, −y).
 *
 * Sizes are always true to each other, the Sun included. Distances from the Sun are squeezed
 * through one log curve unless `trueScale` is on: direction kept, order kept, so the inner planets
 * don't vanish next to the outer ones. The Moon keeps its true distance from the Earth.
 */

/** Squeeze scale (au): distances well below it are nearly true, well above it grow slowly. */
export const SQUEEZE_AU = 1;

export const squeeze = (r: number): number => SQUEEZE_AU * Math.log1p(r / SQUEEZE_AU);

const DEG = Math.PI / 180;
/** J2000 obliquity of the ecliptic. */
const OBLIQUITY = 23.43928 * DEG;

/** Ecliptic J2000 → scene axes. */
export const eclipticToScene = (v: Vec3): Vec3 => [v[0], v[2], -v[1]];

/** ICRF equatorial unit vector → ecliptic J2000. */
function equatorialToEcliptic([x, y, z]: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY);
  const s = Math.sin(OBLIQUITY);
  return [x, c * y + s * z, -s * y + c * z];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * A body's own axes in scene coordinates: x through longitude 0 on the equator, y through east
 * longitude 90°, z through the north pole (IAU convention: W runs from the node of the body's
 * equator on the ICRF equator, at RA α0 + 90°).
 */
export function bodyAxes(body: SolarBody, date: Date): [Vec3, Vec3, Vec3] {
  const d = daysSinceJ2000(date);
  const T = d / 36525;
  const ra = (body.spin.ra[0] + body.spin.ra[1] * T) * DEG;
  const dec = (body.spin.dec[0] + body.spin.dec[1] * T) * DEG;
  const w = ((body.spin.w[0] + body.spin.w[1] * d) % 360) * DEG;
  const pole: Vec3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const node: Vec3 = [Math.cos(ra + Math.PI / 2), Math.sin(ra + Math.PI / 2), 0];
  const east = cross(pole, node);
  const x: Vec3 = [
    node[0] * Math.cos(w) + east[0] * Math.sin(w),
    node[1] * Math.cos(w) + east[1] * Math.sin(w),
    node[2] * Math.cos(w) + east[2] * Math.sin(w),
  ];
  const toScene = (v: Vec3) => eclipticToScene(equatorialToEcliptic(v));
  const xs = toScene(x);
  const zs = toScene(pole);
  return [xs, cross(zs, xs), zs];
}

export interface PlacedBody {
  body: SolarBody;
  /** Centre in the scene (au). */
  pos: Vec3;
  /** Equatorial and polar radius (au). */
  radius: number;
  polar: number;
  /** Own axes (see bodyAxes). */
  axes: [Vec3, Vec3, Vec3];
  /** True distance from the Sun (au), for lighting. */
  sunDistance: number;
}

/** Every body at `date`, laid out for the scene. */
export function layoutAt(date: Date, trueScale: boolean): Record<SolarBodyId, PlacedBody> {
  const { planets, moon } = positionsAt(date);
  const out = {} as Record<SolarBodyId, PlacedBody>;
  const place = (v: Vec3): Vec3 => {
    const r = Math.hypot(...v);
    if (trueScale || r === 0) return eclipticToScene(v);
    const k = squeeze(r) / r;
    return eclipticToScene([v[0] * k, v[1] * k, v[2] * k]);
  };
  for (const body of SOLAR_BODIES) {
    let helio: Vec3 = [0, 0, 0];
    let pos: Vec3 = [0, 0, 0];
    if (body.id === 'moon') {
      const e = planets.earth;
      helio = [e[0] + moon[0], e[1] + moon[1], e[2] + moon[2]];
      const earth = place(e);
      const m = eclipticToScene(moon);
      pos = [earth[0] + m[0], earth[1] + m[1], earth[2] + m[2]];
    } else if (body.id !== 'sun') {
      helio = planets[body.id];
      pos = place(helio);
    }
    out[body.id] = {
      body,
      pos,
      radius: body.radiusKm / AU_KM,
      polar: body.polarKm / AU_KM,
      axes: bodyAxes(body, date),
      sunDistance: Math.hypot(...helio),
    };
  }
  return out;
}
