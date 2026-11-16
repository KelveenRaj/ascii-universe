import { describe, expect, it } from 'vitest';
import type { SolarBodyId } from '@/scenes/solar-system/bodies';
import { positionsAt, type Vec3 } from '@/scenes/solar-system/ephemeris';
import { layoutAt } from '@/scenes/solar-system/layout';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Heliocentric ecliptic J2000 vectors (au) from JPL Horizons, at 00:00 TDB. */
const HORIZONS = {
  '2026-01-01': {
    earth: [-0.1742814809205833, 0.9677589202546031, -5.944511017526243e-5],
    mars: [0.3405796768622151, -1.387002015945254, -0.03741722678770108],
    jupiter: [-1.694003692586729, 4.928882358715955, 0.01742622062607817],
  },
  '2000-01-01': {
    neptune: [16.81075807703606, -24.99265146883861, 0.1272705680239183],
  },
} as const;
/** Moon relative to the Earth, 2026-01-01 00:00 TDB. */
const MOON_2026: Vec3 = [9.647578994045626e-4, 2.201875129333777e-3, 2.122555367574619e-4];

describe('planet positions', () => {
  it('match JPL Horizons to well under a degree', () => {
    for (const [day, bodies] of Object.entries(HORIZONS)) {
      const p = positionsAt(new Date(`${day}T00:00:00Z`)).planets;
      for (const [id, want] of Object.entries(bodies)) {
        const got = p[id as keyof typeof p];
        const r = Math.hypot(...(want as Vec3));
        // angle seen from the Sun, radians
        expect(dist(got, want as Vec3) / r, `${id} on ${day}`).toBeLessThan(0.005);
      }
    }
  });

  it('put the Moon where Horizons does, to about half a degree', () => {
    const { moon } = positionsAt(new Date('2026-01-01T00:00:00Z'));
    const r = Math.hypot(...MOON_2026);
    expect(Math.abs(Math.hypot(...moon) - r) / r).toBeLessThan(0.01);
    expect(dist(moon, MOON_2026) / r).toBeLessThan(0.012);
  });
});

describe('spin and layout', () => {
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const DEG = 180 / Math.PI;

  it('puts the Sun overhead where it really is: 2026-01-01 00:00 UTC, near 180° E, 23° S', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const earth = layoutAt(at, true).earth;
    const [x, y, z] = earth.axes;
    const p = earth.pos;
    const len = Math.hypot(...p);
    const toSun: Vec3 = [-p[0] / len, -p[1] / len, -p[2] / len];
    const lat = Math.asin(dot(toSun, z)) * DEG;
    const lon = Math.atan2(dot(toSun, y), dot(toSun, x)) * DEG;
    expect(lat).toBeCloseTo(-23.0, 0);
    // the equation of time shifts noon by a few minutes (~1°)
    expect(Math.abs(Math.abs(lon) - 180)).toBeLessThan(2);
  });

  it('tips Uranus onto its side and keeps the Earth at 23.4°', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const placed = layoutAt(at, true);
    const up: Vec3 = [0, 1, 0]; // ecliptic north
    // the IAU's "north" pole is the one on the ecliptic's north side, so Uranus' sits 82.2° from
    // ecliptic north and it spins backwards (W decreasing): 180° − 82.2° = the 97.8° obliquity
    expect(Math.acos(dot(placed.uranus.axes[2], up)) * DEG).toBeCloseTo(180 - 97.8, 0);
    expect(placed.uranus.body.spin.w[1]).toBeLessThan(0);
    expect(Math.acos(dot(placed.earth.axes[2], up)) * DEG).toBeCloseTo(23.44, 1);
  });

  it('squeezes distances but keeps order, direction and true sizes', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const squeezed = layoutAt(at, false);
    const real = layoutAt(at, true);
    const r = (id: SolarBodyId) => Math.hypot(...squeezed[id].pos);
    const order: SolarBodyId[] = [
      'mercury',
      'venus',
      'earth',
      'mars',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
    ];
    for (let i = 1; i < order.length; i++) expect(r(order[i])).toBeGreaterThan(r(order[i - 1]));
    expect(r('neptune')).toBeLessThan(5);
    expect(r('mercury')).toBeGreaterThan(squeezed.sun.radius * 30);
    for (const id of order) {
      const a = squeezed[id].pos;
      const b = real[id].pos;
      expect(dot(a, b) / (Math.hypot(...a) * Math.hypot(...b))).toBeCloseTo(1, 9);
      expect(squeezed[id].radius).toBe(real[id].radius);
    }
    // the Moon stays at its true distance from the Earth
    const em = (p: typeof squeezed) => Math.hypot(...p.moon.pos.map((v, i) => v - p.earth.pos[i]));
    expect(em(squeezed)).toBeCloseTo(em(real), 9);
  });
});
