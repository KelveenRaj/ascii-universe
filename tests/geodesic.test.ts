import { describe, expect, it } from 'vitest';
import { CRITICAL_IMPACT_PARAMETER, traceRay } from '@/scenes/black-hole/geodesic';

/** Fire a ray from far away along +z with impact parameter b (offset along x). */
function fire(b: number, start = 1000, escapeRadius = 30) {
  return traceRay([b, 0, -start], [0, 0, 1], { escapeRadius, maxSteps: 20000 });
}

describe('Schwarzschild geodesic integrator', () => {
  it('captures rays inside the critical impact parameter (the shadow)', () => {
    for (const b of [0.5, 1.5, 2.3, CRITICAL_IMPACT_PARAMETER - 0.1]) {
      expect(fire(b).outcome, `b = ${b}`).toBe('captured');
    }
  });

  it('lets rays outside the critical impact parameter escape', () => {
    for (const b of [CRITICAL_IMPACT_PARAMETER + 0.1, 3, 5, 12]) {
      expect(fire(b).outcome, `b = ${b}`).toBe('escaped');
    }
  });

  it('bends distant rays by the weak-field angle 2·r_s / b', () => {
    for (const b of [20, 40]) {
      const res = fire(b, 20000, 20000);
      expect(res.outcome).toBe('escaped');
      // deflection toward the hole (−x), measured from the original +z direction
      const deflection = Math.atan2(-res.direction[0], res.direction[2]);
      const expected = 2 / b + ((15 * Math.PI) / 4) * (0.5 / b) ** 2; // 4M/b + (15π/4)(M/b)², M = 0.5
      expect(deflection).toBeGreaterThan(0);
      expect(Math.abs(deflection - expected) / expected).toBeLessThan(0.03);
    }
  });

  it('sends near-critical rays skimming the photon sphere (r = 1.5)', () => {
    const res = fire(CRITICAL_IMPACT_PARAMETER + 0.002);
    expect(res.outcome).toBe('escaped');
    expect(res.minRadius).toBeGreaterThan(1.5);
    expect(res.minRadius).toBeLessThan(1.6);
  });
});
