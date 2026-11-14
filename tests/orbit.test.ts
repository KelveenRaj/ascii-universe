import { describe, expect, it } from 'vitest';
import {
  advance,
  constraintError,
  launch,
  localSpeed,
  SGR_A_SECONDS_PER_UNIT,
  step,
  type Orbit,
} from '@/scenes/black-hole/orbit';

describe('timelike orbits', () => {
  it('a circular orbit outside the ISCO stays circular', () => {
    // circular orbit at r: L² = M r² / (r − 3M), E = (1 − 1/r) / sqrt(1 − 3M/r), M = 0.5
    const r = 5;
    const L = Math.sqrt((0.5 * r * r) / (r - 1.5));
    const E = (1 - 1 / r) / Math.sqrt(1 - 1.5 / r);
    const o: Orbit = { r, vr: 0, phi: 0, t: 0, tau: 0, E, L };
    for (let i = 0; i < 20_000; i++) step(o, 0.05);
    expect(o.phi).toBeGreaterThan(2 * Math.PI * 5); // several laps
    expect(Math.abs(o.r - r)).toBeLessThan(1e-3);
  });

  it('falling from rest takes the textbook proper time (a cycloid)', () => {
    // from rest at R: r = R/2 (1 + cos η), τ = sqrt(R³ / 8M) (η + sin η)
    const R = 10;
    const o = launch(R, 0, 0, 0);
    while (o.r > 2) step(o, 0.001);
    const eta = Math.acos((2 * o.r) / R - 1);
    const expected = Math.sqrt((R * R * R) / 4) * (eta + Math.sin(eta));
    expect(o.tau).toBeCloseTo(expected, 3);
    expect(o.L).toBe(0);
  });

  it('keeps the first integral during a close flyby', () => {
    const o = launch(20, Math.PI, 0.5, 2.9);
    let minR = o.r;
    let worst = 0;
    advance(o, 300, (s) => {
      minR = Math.min(minR, s.r);
      worst = Math.max(worst, Math.abs(constraintError(s)));
    });
    expect(minR).toBeLessThan(6);
    expect(worst).toBeLessThan(1e-6);
  });

  it('the probe clock runs slow, more so close in', () => {
    const far = launch(20, Math.PI, 0.5, 2.6);
    const near = launch(20, Math.PI, 0.5, 2.9); // skims r ≈ 2.8; 2.95 would fall in
    advance(far, 200);
    expect(advance(near, 200)).toBeNull();
    expect(far.tau).toBeLessThan(far.t);
    expect(near.t - near.tau).toBeGreaterThan(far.t - far.tau);
  });

  it('a slow probe aimed close in is swallowed', () => {
    const o = launch(20, Math.PI, 0.2, Math.PI - 0.02);
    expect(advance(o, 2000)).toBe('horizon');
  });

  it('a hovering observer measures the launch speed back', () => {
    expect(localSpeed(launch(12, 0, 0.6, 1))).toBeCloseTo(0.6, 12);
  });

  it('time unit for Sgr A* is about 42 seconds', () => {
    expect(SGR_A_SECONDS_PER_UNIT).toBeCloseTo(42.4, 1);
  });
});
