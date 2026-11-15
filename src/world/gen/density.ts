import { GALAXY } from '@/scenes/milky-way/layout';
import type { Vec3d } from '@/world/math';

/**
 * How crowded with stars the galaxy is at a point, relative to the Sun's neighbourhood (= 1 there).
 * A CPU copy of the large-scale shape in src/shaders/lib/galaxy.glsl (bulge, bar, smooth disk,
 * four arms) with the galaxy unturned, used to decide how many star systems a sector holds. The
 * shader's small-scale clumps (noise) are left out: nobody can tell, and it keeps this cheap.
 * Keep the shapes in step with galaxy.glsl.
 */
export function rawDensity(p: Vec3d): number {
  const [x, y, z] = p;
  const R = Math.hypot(x, z);
  const ay = Math.abs(y);
  const theta = Math.atan2(z, x);

  const rb = Math.hypot(x, y * 1.4, z);
  const bulge = 0.9 * Math.exp(-rb / 1.0);
  // into the bar's frame: rot(q, -barAngle)
  const c = Math.cos(-GALAXY.barAngle);
  const s = Math.sin(-GALAXY.barAngle);
  const bx = c * x - s * z;
  const bz = s * x + c * z;
  const barShape = Math.hypot(bx / GALAXY.barHalfLength, bz / (0.32 * GALAXY.barHalfLength));
  const bar = 0.7 * Math.exp(-barShape * barShape * 2.2) * Math.exp(-ay / 0.7);
  const disk = 0.35 * Math.exp(-R / 12) * Math.exp(-ay / 1.1);
  const edge = smoothstep(GALAXY.diskRadius, GALAXY.diskRadius * 0.8, R);

  const k = 1 / Math.tan(GALAXY.pitch);
  const psi = theta - GALAXY.barAngle - k * Math.log(Math.max(R, 0.5) / GALAXY.barHalfLength);
  const major = Math.pow(0.5 + 0.5 * Math.cos(2 * psi), 6);
  const minor = Math.pow(0.5 + 0.5 * Math.cos(2 * psi + Math.PI), 7);
  const arms =
    (major + 0.6 * minor) * smoothstep(GALAXY.barHalfLength * 0.7, GALAXY.barHalfLength * 1.1, R);
  const young = 3.2 * arms * 0.55 * Math.exp(-ay / 0.35) * Math.exp(-R / 30) * edge;

  return (bulge + bar + disk) * edge + young;
}

/** GLSL smoothstep, edges in either order. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const SUN: Vec3d = [0, 0, GALAXY.sunRadius];
const SUN_DENSITY = rawDensity(SUN);

/** Star density relative to the Sun's neighbourhood. */
export const density = (p: Vec3d): number => rawDensity(p) / SUN_DENSITY;
