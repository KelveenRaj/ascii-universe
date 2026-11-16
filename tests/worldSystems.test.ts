import { describe, expect, it } from 'vitest';
import { WORLD_SYSTEM_MATERIALS } from '@/scenes/world-system/materials';
import { FlightModel } from '@/world/flight/FlightModel';
import { findInterior, PLANET_KINDS, SYSTEM_MATERIAL, systemInterior } from '@/world/gen/planets';
import { SectorCache } from '@/world/gen/sector';
import { findLandmark, SUN_POS } from '@/world/landmarks';
import { BlackHoleLayer, blocked, keepOut, SolarLayer, SystemLayer } from '@/world/layers';
import { distance, length, normalize, rotate, type Vec3d } from '@/world/math';
import type { Target } from '@/world/Neighbourhood';

const place = (id: string): Target => {
  const l = findLandmark(id)!;
  return { id, name: l.name, kind: l.kind, pos: l.pos, lum: l.lum, material: l.material };
};

describe('system interiors', () => {
  it('builds the Solar System by hand, in order, Saturn ringed', () => {
    const sol = findInterior('sol')!;
    expect(sol.planets.map((p) => p.name)).toEqual([
      'MERCURY',
      'VENUS',
      'EARTH',
      'MARS',
      'JUPITER',
      'SATURN',
      'URANUS',
      'NEPTUNE',
    ]);
    expect(sol.planets[5].ring).not.toBeNull();
    expect(sol.planets.filter((p) => p.ring)).toHaveLength(1);
    const orbits = sol.planets.map((p) => length(p.pos));
    for (let i = 1; i < orbits.length; i++) expect(orbits[i]).toBeGreaterThan(orbits[i - 1]);
  });

  it('gives procedural systems the same planets every time, as many as the system says', () => {
    for (const s of new SectorCache().around(SUN_POS, 1).slice(0, 30)) {
      const a = systemInterior(s);
      expect(a).toEqual(systemInterior(s));
      expect(findInterior(s.id)).toEqual(a);
      expect(a.planets).toHaveLength(s.planets);
    }
  });

  it('keeps every planet clear of the star and of each other, and inside the edge', () => {
    const systems = new SectorCache().around(SUN_POS, 2).map(systemInterior);
    systems.push(findInterior('sol')!, findInterior('betelgeuse')!);
    for (const sys of systems) {
      for (const [i, p] of sys.planets.entries()) {
        expect(PLANET_KINDS).toContain(p.kind);
        expect(length(p.pos)).toBeGreaterThan(sys.starRadius * 2 + p.radius);
        expect(length(p.pos) + p.radius).toBeLessThan(sys.edge);
        for (const q of sys.planets.slice(i + 1)) {
          expect(distance(p.pos, q.pos)).toBeGreaterThan(p.radius + q.radius);
        }
      }
    }
  });

  it('has no inside for Sgr A* (it has a layer of its own) or a bad id', () => {
    expect(findInterior('sgr-a-star')).toBeNull();
    expect(findInterior('nowhere')).toBeNull();
    expect(findInterior('g1:0.0.0:999')).toBeNull();
  });

  it('has a material for every planet kind, star look and ring', () => {
    const ids = WORLD_SYSTEM_MATERIALS.map((m) => m.id);
    for (const [key, index] of Object.entries(SYSTEM_MATERIAL)) {
      expect(index).toBeLessThan(ids.length);
      const id = ids[index];
      const expected =
        { starHot: 'star-hot', starSun: 'star-sun', starRed: 'star-red' }[key] ?? key;
      expect(id).toBe(expected);
    }
  });
});

describe('system layer', () => {
  const layer = new SystemLayer(place('sol'), findInterior('sol')!);

  it('spawns you inside the edge, facing the star', () => {
    const { pos, orient } = layer.spawn([0, 0, 1]);
    expect(layer.outside(pos)).toBe(false);
    expect(length(pos)).toBeGreaterThan(layer.interior.planets.at(-1)!.radius);
    const nose = rotate(orient, [0, 0, -1]);
    const toStar = normalize([-pos[0], -pos[1], -pos[2]]);
    expect(distance(nose, toStar)).toBeLessThan(1e-9);
  });

  it('lets you leave past the edge', () => {
    expect(layer.outside([layer.interior.edge + 1, 0, 0])).toBe(true);
  });

  it('lists the planets as targets and hands the scene everything relative to the camera', () => {
    expect(layer.targets().map((t) => t.name)[2]).toBe('EARTH');
    const cam: Vec3d = [1, 2, 3];
    const frame = layer.sceneFrame(cam).system!;
    expect(frame.star.rel).toEqual([-1, -2, -3]);
    expect(frame.planets).toHaveLength(8);
    expect(frame.planets[5].ring).toBeDefined();
  });
});

describe('black hole layer', () => {
  const layer = new BlackHoleLayer(place('sgr-a-star'));

  it('arrives from the side you came, a little above the disk', () => {
    const { pos } = layer.spawn(normalize([1, 0, 0]));
    expect(pos[0]).toBeGreaterThan(40);
    expect(pos[1]).toBeGreaterThan(0);
    expect(layer.outside(pos)).toBe(false);
  });

  it('keeps the ship out of the hole', () => {
    const f = new FlightModel([0.5, 0, 0]);
    f.vel = [-3, 0, 0];
    keepOut(f, layer.occluders());
    expect(length(f.pos)).toBeGreaterThanOrEqual(4);
    expect(f.vel[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('Sol layer', () => {
  const make = () => new SolarLayer(place('sol'));

  it('lists the Sun, the planets and the Moon, each at its real place for the date', () => {
    const layer = make();
    expect(layer.targets().map((t) => t.name)).toEqual([
      'SUN',
      'MERCURY',
      'VENUS',
      'EARTH',
      'MOON',
      'MARS',
      'JUPITER',
      'SATURN',
      'URANUS',
      'NEPTUNE',
    ]);
    const dist = (name: string) => length(layer.targets().find((t) => t.name === name)!.pos);
    expect(dist('SUN')).toBe(0);
    // squeezed, but in the real order outward
    expect(dist('MERCURY')).toBeLessThan(dist('VENUS'));
    expect(dist('JUPITER')).toBeLessThan(dist('NEPTUNE'));
    expect(dist('NEPTUNE')).toBeLessThan(4.5);
    // true sizes: the Sun is ~109 Earths across
    expect(layer.radiusOf('sun') / layer.radiusOf('earth')).toBeCloseTo(109, -1);
  });

  it('spawns you outside the planets, inside the edge, facing the Sun', () => {
    const layer = make();
    const { pos, orient } = layer.spawn([0, 0, 1]);
    expect(layer.outside(pos)).toBe(false);
    expect(length(pos)).toBeGreaterThan(length(layer.targets()[8].pos));
    const nose = rotate(orient, [0, 0, -1]);
    expect(distance(nose, normalize([-pos[0], -pos[1], -pos[2]]))).toBeLessThan(1e-9);
    expect(layer.outside([5, 0, 0])).toBe(true);
  });

  it('moves the planets with its clock, and holds still when told to', () => {
    const layer = make();
    const earth = () => [...layer.targets()[3].pos] as Vec3d;
    const t0 = layer.time;
    const a = earth();
    layer.tick(0);
    expect(layer.time).toBe(t0);
    expect(earth()).toEqual(a);
    layer.tick(10_000);
    expect(layer.time).toBeGreaterThan(t0);
    expect(distance(earth(), a)).toBeGreaterThan(0.1);
  });

  it('scales speed and camera with the distance to the nearest body', () => {
    const layer = make();
    layer.adapt(layer.spawn([0, 0, 1]).pos);
    const far = { cruise: layer.tuning.cruise, back: layer.rig.back, dust: layer.dustRadius };
    const earth = layer.targets()[3].pos;
    const r = layer.radiusOf('earth');
    layer.adapt([earth[0] + 3 * r, earth[1], earth[2]]);
    expect(layer.tuning.cruise).toBeLessThan(far.cruise / 1000);
    expect(layer.rig.back).toBeLessThan(far.back / 1000);
    expect(layer.dustRadius).toBeLessThan(far.dust / 1000);
    expect(layer.rig.back).toBeGreaterThan(0);
    // exposure follows the body you're close to, and lets go far out
    expect(layer.sceneFrame().solar!.focus).toBe('earth');
    layer.adapt(layer.spawn([0, 0, 1]).pos);
    expect(layer.sceneFrame().solar!.focus).toBeNull();
  });

  it('keeps the ship a body-radius clear of the surface, with room for the chase camera', () => {
    const layer = make();
    const earth = layer.targets()[3].pos;
    const r = layer.radiusOf('earth');
    const f = new FlightModel([earth[0] + 1.2 * r, earth[1], earth[2]]);
    f.vel = [-1e-4, 0, 0];
    keepOut(f, layer.occluders(), layer.keepOutMargin);
    expect(distance(f.pos, earth)).toBeGreaterThanOrEqual(1.4 * r);
  });

  it('reads speed in km/s, then in light-speeds', () => {
    const layer = make();
    expect(layer.formatSpeed(0)).toBe('0 KM/S');
    expect(layer.formatSpeed(1e-4)).toMatch(/KM\/S$/);
    expect(layer.formatSpeed(1)).toMatch(/ C$/);
  });
});

describe('occlusion', () => {
  const spheres = [{ pos: [0, 0, 0] as Vec3d, radius: 1 }];

  it('hides what is behind a sphere', () => {
    expect(blocked([0, 0, 5], [0, 0, -5], spheres)).toBe(true);
    expect(blocked([0, 0, 5], [0, 3, -5], spheres)).toBe(false);
  });

  it('does not hide what is in front of it', () => {
    expect(blocked([0, 0, 5], [0, 0, 2], spheres)).toBe(false);
  });

  it('leaves flight outside spheres alone', () => {
    const f = new FlightModel([0, 0, 3]);
    f.vel = [0, 0, -1];
    keepOut(f, spheres);
    expect(f.pos).toEqual([0, 0, 3]);
    expect(f.vel).toEqual([0, 0, -1]);
  });
});
