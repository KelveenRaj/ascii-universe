import { describe, expect, it } from 'vitest';
import { HyperJump } from '@/world/flight/HyperJump';
import { density } from '@/world/gen/density';
import { findSystem, SectorCache, sectorOf, sectorSystems, SECTOR } from '@/world/gen/sector';
import { findLandmark, LANDMARKS, SUN_POS } from '@/world/landmarks';
import { distance, length, quatLookAt, quatNlerp, rotate, sub, type Vec3d } from '@/world/math';
import { Neighbourhood } from '@/world/Neighbourhood';
import { apparentBrightness, formatDistance, nearStars } from '@/world/stars';

const close = (a: Vec3d, b: Vec3d, eps = 1e-9) => expect(distance(a, b)).toBeLessThan(eps);

describe('galaxy density', () => {
  it('is 1 at the Sun', () => {
    expect(density(SUN_POS)).toBeCloseTo(1, 6);
  });

  it('falls away from the plane and towards the rim', () => {
    expect(density([0, 1, 27])).toBeLessThan(density([0, 0, 27]) * 0.5);
    const ring = (r: number) => {
      let sum = 0;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        sum += density([r * Math.cos(a), 0, r * Math.sin(a)]);
      }
      return sum / 72;
    };
    expect(ring(45)).toBeLessThan(ring(27));
    expect(density([0, 0, 80])).toBe(0);
  });

  it('is crowded in the middle', () => {
    expect(density([0, 0, 0.5])).toBeGreaterThan(5);
  });

  it('is higher on the arms than between them somewhere around the Sun', () => {
    const around = Array.from({ length: 72 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2;
      return density([27 * Math.cos(a), 0, 27 * Math.sin(a)]);
    });
    expect(Math.max(...around) / Math.min(...around)).toBeGreaterThan(1.5);
  });
});

describe('procedural sectors', () => {
  it('gives the same systems every time', () => {
    const a = sectorSystems([0, 0, 540]);
    const b = sectorSystems([0, 0, 540]);
    expect(a).toEqual(b);
  });

  it('snapshot: the sectors next to the Sun (changing this needs a new GEN)', () => {
    const summary = [-1, 0, 1].flatMap((dx) =>
      sectorSystems([dx, 0, 540]).map((s) => `${s.id} ${s.name} ${s.starClass} ${s.planets}`),
    );
    expect(summary).toMatchSnapshot();
  });

  it('puts every system inside its own sector', () => {
    for (let x = -3; x <= 3; x++) {
      for (const s of sectorSystems([x, 0, 540])) {
        expect(sectorOf(s.pos)).toEqual([x, 0, 540]);
      }
    }
  });

  it('has a few systems per sector near the Sun and none far outside the disk', () => {
    const cache = new SectorCache();
    const near = cache.around(SUN_POS, 2).length;
    expect(near / 125).toBeGreaterThan(1);
    expect(near / 125).toBeLessThan(8);
    expect(cache.around([0, 30, 27], 1)).toHaveLength(0);
  });

  it('finds a system again from its id', () => {
    const s = sectorSystems([2, 0, 541])[0] ?? sectorSystems([3, 0, 541])[0];
    expect(s).toBeDefined();
    expect(findSystem(s.id)).toEqual(s);
    expect(findSystem('g9:0.0.0:0')).toBeNull();
    expect(findSystem(`${s.id.slice(0, -1)}99`)).toBeNull();
  });

  it('still resolves generator 1 ids saved before the galaxy was rebuilt', () => {
    const old = sectorSystems([2, 0, 541], 1)[0] ?? sectorSystems([3, 0, 541], 1)[0];
    expect(old.id.startsWith('g1:')).toBe(true);
    expect(findSystem(old.id)).toEqual(old);
    expect(sectorSystems([2, 0, 541])[0]?.id.startsWith('g2:') ?? true).toBe(true);
  });

  it('snapshot: generator 1 is frozen', () => {
    const summary = [-1, 0, 1].flatMap((dx) =>
      sectorSystems([dx, 0, 540], 1).map((s) => `${s.id} ${s.name} ${s.starClass} ${s.planets}`),
    );
    expect(summary).toMatchSnapshot();
  });

  it('has sensible names', () => {
    for (const s of new SectorCache().around(SUN_POS, 1)) {
      expect(s.name).toMatch(/^[A-Z][A-Z' -]{1,15}$/);
    }
  });

  it('keeps a bounded cache', () => {
    const cache = new SectorCache(8);
    for (let i = 0; i < 20; i++) cache.get([i, 0, 540]);
    expect(cache.get([19, 0, 540])).toEqual(sectorSystems([19, 0, 540]));
  });
});

describe('landmarks', () => {
  it('puts Sgr A* at the centre and Sol at the Sun', () => {
    expect(findLandmark('sgr-a-star')!.pos).toEqual([0, 0, 0]);
    expect(findLandmark('sol')!.pos).toEqual(SUN_POS);
  });

  it('places stars at their distance from the Sun', () => {
    expect(distance(findLandmark('sirius')!.pos, SUN_POS) * 1000).toBeCloseTo(8.6, 6);
    expect(distance(findLandmark('deneb')!.pos, SUN_POS) * 1000).toBeCloseTo(2600, 3);
  });

  it('points galactic longitude 0 at the centre', () => {
    // Sgr A* is at l ≈ 0, so anything at l = 0, b = 0 is on the line Sun → origin
    const dir = sub(findLandmark('sgr-a-star')!.pos, SUN_POS);
    expect(dir[0]).toBeCloseTo(0, 9);
    expect(dir[2]).toBeLessThan(0);
  });

  it('has unique ids that are not system ids', () => {
    const ids = LANDMARKS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toContain(':');
  });
});

describe('neighbourhood', () => {
  it('lists nearby systems nearest first and finds targets by id', () => {
    const hood = new Neighbourhood();
    hood.update(SUN_POS);
    const near = hood.nearestSystems(SUN_POS, 10);
    expect(near.length).toBe(10);
    for (let i = 1; i < near.length; i++) {
      expect(distance(near[i].pos, SUN_POS)).toBeGreaterThanOrEqual(
        distance(near[i - 1].pos, SUN_POS),
      );
    }
    expect(hood.find(near[0].id)).toBe(near[0]);
    expect(hood.find('vega')?.name).toBe('VEGA');
  });
});

describe('star brightness', () => {
  it('gets dimmer with distance and brighter with luminosity', () => {
    expect(apparentBrightness(1, 0.005)).toBeGreaterThan(apparentBrightness(1, 0.05));
    expect(apparentBrightness(100, 0.05)).toBeGreaterThan(apparentBrightness(1, 0.05));
    expect(apparentBrightness(1e9, 1e-9)).toBeLessThanOrEqual(3);
  });

  it('picks the brightest stars, relative to the camera', () => {
    const hood = new Neighbourhood();
    hood.update(SUN_POS);
    const cam: Vec3d = [0.001, 0, 27];
    const stars = nearStars([...hood.nearestSystems(cam, 40), ...hood.landmarks], cam, 48);
    expect(stars.length).toBeGreaterThan(0);
    expect(stars.length).toBeLessThanOrEqual(48);
    for (let i = 1; i < stars.length; i++) {
      expect(stars[i].brightness).toBeLessThanOrEqual(stars[i - 1].brightness);
    }
    // Sol is 1 ly away: it's in there, and close to the camera
    expect(stars.some((s) => length(s.rel as Vec3d) < 0.0011)).toBe(true);
  });

  it('formats distances', () => {
    expect(formatDistance(0.0042)).toBe('4.2 LY');
    expect(formatDistance(0.43)).toBe('430 LY');
    expect(formatDistance(2.6)).toBe('2,600 LY');
    expect(formatDistance(27)).toBe('27.0 KLY');
  });
});

describe('hyperspace', () => {
  it('stops short of the target, on the way there, and eases in and out', () => {
    const from: Vec3d = [0, 0, 27];
    const target: Vec3d = [0.3, 0, 27];
    const hop = new HyperJump(from, target, 0.006);
    close(hop.to, [0.294, 0, 27]);
    expect(hop.duration).toBeGreaterThan(2);
    expect(hop.duration).toBeLessThanOrEqual(6);
    const first = hop.step(0.05);
    expect(length(first.vel)).toBeLessThan(0.1);
    let last = first;
    while (!hop.done) last = hop.step(1 / 60);
    close(last.pos, hop.to);
    expect(length(last.vel)).toBeLessThan(1e-6);
  });

  it('takes longer for longer trips, up to a limit', () => {
    const short = new HyperJump([0, 0, 0], [0.01, 0, 0], 0.006);
    const long = new HyperJump([0, 0, 0], [5, 0, 0], 0.006);
    const huge = new HyperJump([0, 0, 0], [80, 0, 0], 0.006);
    expect(long.duration).toBeGreaterThan(short.duration);
    expect(huge.duration).toBeLessThanOrEqual(6);
  });

  it('does nothing when already inside the stand-off', () => {
    const hop = new HyperJump([0, 0, 0], [0.001, 0, 0], 0.006);
    close(hop.to, [0, 0, 0]);
  });
});

describe('look-at rotation', () => {
  it('turns the nose (−Z) to face a direction, keeping up roughly up', () => {
    const dir: Vec3d = [1 / Math.SQRT2, 0, 1 / Math.SQRT2];
    const q = quatLookAt(dir, [0, 1, 0]);
    close(rotate(q, [0, 0, -1]), dir);
    close(rotate(q, [0, 1, 0]), [0, 1, 0]);
  });

  it('copes with looking straight up', () => {
    const q = quatLookAt([0, 1, 0], [0, 1, 0]);
    close(rotate(q, [0, 0, -1]), [0, 1, 0]);
  });

  it('blends between rotations', () => {
    const a = quatLookAt([0, 0, -1], [0, 1, 0]);
    const b = quatLookAt([1, 0, 0], [0, 1, 0]);
    close(rotate(quatNlerp(a, b, 0), [0, 0, -1]), [0, 0, -1]);
    close(rotate(quatNlerp(a, b, 1), [0, 0, -1]), [1, 0, 0]);
    const mid = rotate(quatNlerp(a, b, 0.5), [0, 0, -1]);
    expect(mid[0]).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

it('sector size is 50 light-years', () => {
  expect(SECTOR * 1000).toBe(50);
});
