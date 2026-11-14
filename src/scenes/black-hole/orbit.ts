/**
 * Orbits of things with mass (a probe, a star) around a Schwarzschild black hole. geodesic.ts does
 * light; this is the timelike version, used by the Slingshot game.
 *
 * Units: r_s = 1, c = 1, so M = 0.5 and times are in r_s/c. Motion stays in a plane, described in
 * Schwarzschild coordinates (r, φ, t) and the probe's own proper time τ, with the conserved
 *   E = (1 − 1/r) dt/dτ   (energy per unit mass)
 *   L = r² dφ/dτ          (angular momentum per unit mass)
 * and the radial equation d²r/dτ² = −M/r² + L²/r³ − 3ML²/r⁴, integrated with RK4. The first
 * integral (dr/dτ)² = E² − (1 − 1/r)(1 + L²/r²) is left free and checked in tests instead.
 *
 * Landmarks: horizon r = 1, photon sphere 1.5, innermost stable circular orbit (ISCO) 3.
 */

const M = 0.5;

/** Seconds per r_s/c for Sagittarius A* (4.30 million solar masses: 2GM/c³ ≈ 42.4 s). */
export const SGR_A_SECONDS_PER_UNIT = 4.3e6 * 9.851e-6;

export interface OrbitState {
  r: number;
  /** dr/dτ */
  vr: number;
  phi: number;
  /** Outside (coordinate) time, r_s/c. */
  t: number;
  /** The probe's own clock, r_s/c. */
  tau: number;
}

export interface Orbit extends OrbitState {
  E: number;
  L: number;
}

/**
 * A probe at radius r0, angle phi0, moving at `speed` (fraction of c, as measured by an observer
 * hovering there) in direction `heading`: the angle from the outward radial direction, positive
 * towards increasing φ.
 */
export function launch(r0: number, phi0: number, speed: number, heading: number): Orbit {
  if (!(r0 > 1)) throw new Error('Launch point must be outside the horizon');
  const v = Math.min(Math.max(speed, 0), 0.999);
  const gamma = 1 / Math.sqrt(1 - v * v);
  const lapse = Math.sqrt(1 - 1 / r0);
  return {
    r: r0,
    vr: gamma * v * Math.cos(heading) * lapse,
    phi: phi0,
    t: 0,
    tau: 0,
    E: gamma * lapse,
    L: gamma * v * Math.sin(heading) * r0,
  };
}

/** d²r/dτ² */
export function radialAccel(r: number, L: number): number {
  const L2 = L * L;
  return -M / (r * r) + L2 / (r * r * r) - (3 * M * L2) / (r * r * r * r);
}

/** How far the state is from the first integral; ~0 if the integration is accurate. */
export function constraintError(o: Orbit): number {
  return o.vr * o.vr - (o.E * o.E - (1 - 1 / o.r) * (1 + (o.L * o.L) / (o.r * o.r)));
}

/** Speed a hovering observer at the probe's radius would measure (fraction of c). */
export function localSpeed(o: Orbit): number {
  const gamma = o.E / Math.sqrt(Math.max(1e-12, 1 - 1 / o.r));
  return Math.sqrt(Math.max(0, 1 - 1 / (gamma * gamma)));
}

type Deriv = [number, number, number, number, number];

function deriv(r: number, vr: number, E: number, L: number): Deriv {
  return [vr, radialAccel(r, L), L / (r * r), E / (1 - 1 / r), 1];
}

/** One RK4 step of proper time dτ. */
export function step(o: Orbit, dTau: number): void {
  const { E, L } = o;
  const k1 = deriv(o.r, o.vr, E, L);
  const k2 = deriv(o.r + 0.5 * dTau * k1[0], o.vr + 0.5 * dTau * k1[1], E, L);
  const k3 = deriv(o.r + 0.5 * dTau * k2[0], o.vr + 0.5 * dTau * k2[1], E, L);
  const k4 = deriv(o.r + dTau * k3[0], o.vr + dTau * k3[1], E, L);
  const w = (i: number) => (dTau / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  o.r += w(0);
  o.vr += w(1);
  o.phi += w(2);
  o.t += w(3);
  o.tau += w(4);
}

/** Below this radius the probe is treated as gone: it crosses the horizon moments later. */
export const HORIZON_CUTOFF = 1.02;

export type OrbitEvent = 'horizon' | null;

/**
 * Advances until the outside clock has moved on by `dt` (or the probe reaches the horizon). Steps
 * are small near the hole and large far away. Calls `onStep` after every step (for trails, closest
 * approach, deflection).
 */
export function advance(o: Orbit, dt: number, onStep?: (o: Orbit) => void): OrbitEvent {
  const tEnd = o.t + dt;
  for (let i = 0; i < 50_000 && o.t < tEnd; i++) {
    if (o.r < HORIZON_CUTOFF) return 'horizon';
    const lapse = 1 - 1 / o.r;
    // proper-time step: shorter close in, and never past the requested outside time
    const byRadius = Math.min(0.5, Math.max(1e-4, 0.01 * o.r ** 1.5));
    const byTime = ((tEnd - o.t) * lapse) / o.E;
    step(o, Math.max(1e-6, Math.min(byRadius, byTime)));
    onStep?.(o);
  }
  return o.r < HORIZON_CUTOFF ? 'horizon' : null;
}

/** Position in the orbit plane. */
export function planePosition(o: OrbitState): [number, number] {
  return [o.r * Math.cos(o.phi), o.r * Math.sin(o.phi)];
}

/** Direction of travel in the orbit plane (radians), for measuring how far the path bends. */
export function heading(o: Orbit): number {
  const dphi = o.L / (o.r * o.r);
  const c = Math.cos(o.phi);
  const s = Math.sin(o.phi);
  const vx = o.vr * c - o.r * s * dphi;
  const vy = o.vr * s + o.r * c * dphi;
  return Math.atan2(vy, vx);
}
