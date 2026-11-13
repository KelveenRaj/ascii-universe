/**
 * CPU mirror of the geodesic integrator in src/shaders/blackhole.frag, used by unit tests to check
 * the physics (capture radius, light deflection). Keep the stepping logic identical to the shader.
 *
 * Units: r_s = 1. Acceleration a = -1.5 · h² · x / r⁵ with h = |x × v|.
 */
export type Vec3 = [number, number, number];

export interface TraceResult {
  outcome: 'captured' | 'escaped' | 'exhausted';
  /** Final direction of travel (normalised). */
  direction: Vec3;
  /** Final position. */
  position: Vec3;
  steps: number;
  /** Closest approach to the hole along the path. */
  minRadius: number;
}

export interface TraceOptions {
  maxSteps?: number;
  escapeRadius?: number;
}

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Spatial step length. Must match stepLength() in blackhole.frag. */
export function stepLength(r: number): number {
  return clamp(0.08 * r * clamp(r / 4, 0.35, 1), 0.02, 4);
}

export function traceRay(origin: Vec3, direction: Vec3, options: TraceOptions = {}): TraceResult {
  const { maxSteps = 4000, escapeRadius = 30 } = options;
  const dl = len(direction);
  const pos: Vec3 = [...origin];
  const vel: Vec3 = [direction[0] / dl, direction[1] / dl, direction[2] / dl];
  const hv = cross(pos, vel);
  const h2 = dot(hv, hv);

  const accelInto = (p: Vec3, dt: number) => {
    const r = len(p);
    const k = (-1.5 * h2) / r ** 5;
    vel[0] += 0.5 * dt * k * p[0];
    vel[1] += 0.5 * dt * k * p[1];
    vel[2] += 0.5 * dt * k * p[2];
  };

  let outcome: TraceResult['outcome'] = 'exhausted';
  let steps = 0;
  let minRadius = len(pos);
  for (let i = 0; i < maxSteps; i++) {
    steps = i + 1;
    const dt = stepLength(len(pos)) / len(vel);
    accelInto(pos, dt);
    pos[0] += dt * vel[0];
    pos[1] += dt * vel[1];
    pos[2] += dt * vel[2];
    accelInto(pos, dt);

    const r = len(pos);
    minRadius = Math.min(minRadius, r);
    if (r < 1) {
      outcome = 'captured';
      break;
    }
    if (r > escapeRadius && dot(pos, vel) > 0) {
      outcome = 'escaped';
      break;
    }
  }

  const vl = len(vel);
  return {
    outcome,
    direction: [vel[0] / vl, vel[1] / vl, vel[2] / vl],
    position: pos,
    steps,
    minRadius,
  };
}

/** Critical impact parameter b_c = 3√3·M = (3√3 / 2)·r_s ≈ 2.598: the edge of the shadow. */
export const CRITICAL_IMPACT_PARAMETER = (3 * Math.sqrt(3)) / 2;
