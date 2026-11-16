import type { Vec3d } from '@/world/math';

/**
 * Generator 1's galaxy density, frozen: the generic four-arm spiral the galaxy had before it was
 * rebuilt from published models. Star systems with `g1:` ids were placed with it, so it must never
 * change; see density.ts for the current shape.
 */
const DISK_RADIUS = 50;
const BAR_HALF_LENGTH = 13.5;
const BAR_ANGLE = Math.PI / 4;
const PITCH = (13 * Math.PI) / 180;
const SUN_RADIUS = 27;

function rawDensityG1(p: Vec3d): number {
  const [x, y, z] = p;
  const R = Math.hypot(x, z);
  const ay = Math.abs(y);
  const theta = Math.atan2(z, x);

  const rb = Math.hypot(x, y * 1.4, z);
  const bulge = 0.9 * Math.exp(-rb / 1.0);
  const c = Math.cos(-BAR_ANGLE);
  const s = Math.sin(-BAR_ANGLE);
  const bx = c * x - s * z;
  const bz = s * x + c * z;
  const barShape = Math.hypot(bx / BAR_HALF_LENGTH, bz / (0.32 * BAR_HALF_LENGTH));
  const bar = 0.7 * Math.exp(-barShape * barShape * 2.2) * Math.exp(-ay / 0.7);
  const disk = 0.35 * Math.exp(-R / 12) * Math.exp(-ay / 1.1);
  const edge = smoothstep(DISK_RADIUS, DISK_RADIUS * 0.8, R);

  const k = 1 / Math.tan(PITCH);
  const psi = theta - BAR_ANGLE - k * Math.log(Math.max(R, 0.5) / BAR_HALF_LENGTH);
  const major = Math.pow(0.5 + 0.5 * Math.cos(2 * psi), 6);
  const minor = Math.pow(0.5 + 0.5 * Math.cos(2 * psi + Math.PI), 7);
  const arms = (major + 0.6 * minor) * smoothstep(BAR_HALF_LENGTH * 0.7, BAR_HALF_LENGTH * 1.1, R);
  const young = 3.2 * arms * 0.55 * Math.exp(-ay / 0.35) * Math.exp(-R / 30) * edge;

  return (bulge + bar + disk) * edge + young;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const SUN_DENSITY = rawDensityG1([0, 0, SUN_RADIUS]);

/** Generator 1's star density relative to the Sun's neighbourhood. */
export const densityG1 = (p: Vec3d): number => rawDensityG1(p) / SUN_DENSITY;
