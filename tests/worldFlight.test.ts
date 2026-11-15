import { describe, expect, it } from 'vitest';
import { ChaseCamera } from '@/world/flight/ChaseCamera';
import { FlightModel, GALAXY_TUNING, NO_CONTROLS } from '@/world/flight/FlightModel';
import { SpaceDust } from '@/world/flight/SpaceDust';
import { distance, length, sub, type Vec3d } from '@/world/math';

const START: Vec3d = [0, 0.02, 27];
const fly = (f: FlightModel, seconds: number, c = NO_CONTROLS) => {
  let flown = 0;
  for (let t = 0; t < seconds; t += 1 / 60) flown += f.step(1 / 60, c);
  return flown;
};

describe('arcade flight', () => {
  it('sits still until you open the throttle', () => {
    const f = new FlightModel(START);
    fly(f, 2);
    expect(f.pos).toEqual(START);
    expect(f.speed).toBe(0);
  });

  it('settles at the cruising speed along its nose (-Z)', () => {
    const f = new FlightModel(START);
    fly(f, 2, { ...NO_CONTROLS, throttle: 1 }); // 0.8/s: full after 1.25 s
    expect(f.throttle).toBe(1);
    fly(f, 6);
    expect(f.speed).toBeCloseTo(GALAXY_TUNING.cruise, 6);
    expect(f.pos[2]).toBeLessThan(START[2]);
    expect(f.pos[0]).toBeCloseTo(0, 9);
  });

  it('boosts, and brakes by itself when the throttle is cut', () => {
    const f = new FlightModel(START);
    f.throttle = 1;
    fly(f, 4, { ...NO_CONTROLS, boost: true });
    expect(f.boosting).toBe(true);
    expect(f.speed).toBeGreaterThan(GALAXY_TUNING.cruise * GALAXY_TUNING.boost * 0.95);
    fly(f, 0.1, { ...NO_CONTROLS, stop: true });
    expect(f.throttle).toBe(0);
    fly(f, 6);
    expect(f.speed).toBeLessThan(GALAXY_TUNING.cruise * 0.01);
  });

  it('turns left on positive yaw and noses up on positive pitch, with no sideways drift after', () => {
    const left = new FlightModel(START);
    fly(left, 0.5, { ...NO_CONTROLS, yaw: 1 });
    expect(left.forward[0]).toBeLessThan(-0.3);

    const up = new FlightModel(START);
    fly(up, 0.5, { ...NO_CONTROLS, pitch: 1 });
    expect(up.forward[1]).toBeGreaterThan(0.3);

    left.throttle = 1;
    fly(left, 8);
    const dir = sub(left.vel, [0, 0, 0]);
    const along =
      (dir[0] * left.forward[0] + dir[1] * left.forward[1] + dir[2] * left.forward[2]) /
      length(dir);
    expect(along).toBeGreaterThan(0.9999);
  });

  it('keeps the orientation a unit quaternion over long flights', () => {
    const f = new FlightModel(START);
    fly(f, 30, { ...NO_CONTROLS, yaw: 0.7, pitch: 0.4, roll: 1, throttle: 1 });
    expect(Math.hypot(...f.orient)).toBeCloseTo(1, 12);
  });

  it('reports the distance flown', () => {
    const f = new FlightModel(START);
    f.throttle = 1;
    const before = f.pos;
    const flown = fly(f, 3);
    expect(flown).toBeCloseTo(distance(before, f.pos), 9);
  });
});

describe('chase camera', () => {
  it('rests behind and above the ship at a fixed distance, at any speed', () => {
    const cam = new ChaseCamera({ back: 4, up: 1, ahead: 10 });
    const fwd: Vec3d = [0, 0, -1];
    const up: Vec3d = [0, 1, 0];
    const first = cam.update(0, [0, 0, 0], fwd, up);
    expect(first.position).toEqual([0, 1, 4]);
    expect(first.target).toEqual([0, 0, -10]);
    // far away and after a turn, it still keeps its distance from the ship
    const ship: Vec3d = [1000, 0, -5000];
    for (let i = 0; i < 30; i++) {
      const p = cam.update(1 / 60, ship, [-1, 0, 0], up);
      expect(distance(p.position, ship)).toBeCloseTo(Math.hypot(4, 1), 9);
    }
  });
});

describe('space dust', () => {
  it('keeps every speck near the ship however fast it flies', () => {
    const dust = new SpaceDust(1, 50, 3);
    for (let i = 0; i < 200; i++) {
      dust.update(1 / 60, [0, 0, -300]);
      for (const p of dust.specks) expect(length(p)).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(dust.specks).toHaveLength(50);
    // refilled ahead of the ship (towards -Z), so they stream past
    const ahead = dust.specks.filter((p) => p[2] < 0).length;
    expect(ahead).toBeGreaterThan(25);
  });
});
