import { armSegments, armStrength, ARM_WIDTH_GROWTH, GALAXY, KPC } from '@/scenes/milky-way/layout';
import type { Vec3d } from '@/world/math';

/**
 * How crowded with stars the galaxy is at a point, relative to the Sun's neighbourhood (= 1 there).
 * A CPU copy of the large-scale shape in src/shaders/lib/galaxy.glsl (disks, bulge, bar, nuclear
 * disk, the Reid et al. 2019 arms) with the galaxy unturned, used to decide how many star systems
 * a sector holds (generator 2; generator 1's frozen shape is in densityG1.ts). The shader's
 * small-scale clumps (noise) are left out, using their average instead. Keep it in step with
 * galaxy.glsl.
 */
const SEGMENTS = armSegments();
const TWO_PI = 2 * Math.PI;

/** Spiral-arm emission at radius R, azimuth beta (Reid's convention). */
function spiralArms(R: number, beta: number): number {
  let arms = 0;
  for (const s of SEGMENTS) {
    let b = beta + TWO_PI * Math.ceil((s.b0 - beta) / TWO_PI);
    for (; b <= s.b1; b += TWO_PI) {
      const ra = Math.exp(s.lnR0 + s.slope * (b - s.b0));
      const sigma = Math.max(s.width + ARM_WIDTH_GROWTH * (ra - s.rKink), 0.1 * KPC);
      const d = (R - ra) / Math.sqrt(1 + s.slope * s.slope);
      arms = Math.max(
        arms,
        s.weight * armStrength(s, b) * Math.exp((-0.5 * d * d) / (sigma * sigma)),
      );
    }
  }
  return arms;
}

/** Into a frame turned by `beta` (radians from the Sun line, towards +X): x along the axis. */
function toAxisFrame(x: number, z: number, beta: number): [number, number] {
  const theta = Math.PI / 2 - beta;
  const c = Math.cos(-theta);
  const s = Math.sin(-theta);
  return [c * x - s * z, s * x + c * z];
}

export function rawDensity(p: Vec3d): number {
  const g = GALAXY;
  const [x, y, z] = p;
  const R = Math.hypot(x, z);
  const ay = Math.abs(y);
  const beta = Math.PI / 2 - Math.atan2(z, x);
  const edge = smoothstep(g.diskRadius, g.diskRadius * 0.8, R);

  const thin = Math.exp(-R / g.thinLength - ay / g.thinHeight);
  const thickNorm =
    g.thickFraction * Math.exp(g.sunRadius / g.thickLength - g.sunRadius / g.thinLength);
  const thick = thickNorm * Math.exp(-R / g.thickLength - ay / g.thickHeight);
  const disk = 0.6 * (thin + thick);

  const [bx, bz] = toAxisFrame(x, z, g.bulgeAngle);
  const xBump = Math.exp(-(((Math.abs(bx) - g.bulgeXRadius) / (0.4 * g.bulgeXRadius)) ** 2));
  const hz = g.bulgeScale[2] * (1 + 0.95 * xBump);
  const bulge = 0.9 * Math.exp(-Math.hypot(bx / g.bulgeScale[0], bz / g.bulgeScale[1], ay / hz));

  const [lx, lz] = toAxisFrame(x, z, g.barAngle);
  const along = Math.abs(lx) / g.barHalfLength;
  const barPlan = Math.exp(-(along ** 4)) * Math.exp(-((lz / (0.3 * g.barHalfLength)) ** 2));
  const bar =
    barPlan *
    (0.45 * Math.exp(-along * 1.2 - ay / g.barThinHeight) +
      0.35 * along * Math.exp(-ay / g.barSuperthinHeight));

  const nsd = 0.6 * Math.exp(-R / (0.4 * g.nsdRadius) - ay / g.nsdHeight);

  const arms = spiralArms(R, beta) * smoothstep(2.5 * KPC, 3.5 * KPC, R);
  // 0.55: the shader's clump factor on average
  const young = 2.4 * arms * 0.55 * Math.exp(-ay / g.barThinHeight) * Math.exp(-R / 40) * edge;

  return (disk + bulge + bar + nsd) * edge + young;
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
