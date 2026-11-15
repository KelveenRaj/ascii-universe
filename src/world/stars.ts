import type { NearStar } from '@/engine/scene/SceneModule';
import { distance, sub, type Vec3d } from '@/world/math';
import type { Target } from '@/world/Neighbourhood';

/** kly → light-years */
export const LY_PER_KLY = 1000;

/**
 * How bright a star looks from `dKly` away, in scene brightness units: log-squashed flux, so a
 * neighbour a few light-years off is dazzling, one 50 ly away a clear point, and a supergiant
 * hundreds of light-years away still easy to spot.
 */
export function apparentBrightness(lum: number, dKly: number): number {
  const ly = Math.max(0.05, dKly * LY_PER_KLY);
  const flux = lum / (ly * ly);
  return Math.min(3, 0.3 * Math.log10(1 + flux * 3e4));
}

/** Core size in sky pixels for a star this bright (brighter looks bigger). */
export const starSize = (brightness: number): number => Math.min(3, 0.8 + brightness);

/** Below this it isn't worth a slot in the shader. */
const VISIBLE = 0.02;

/**
 * The stars for the galaxy layer to draw, brightest first, at most `max`, relative to the camera.
 * `skip` leaves out targets drawn some other way (Sgr A* is the galaxy's own core glow).
 */
export function nearStars(
  targets: readonly Target[],
  camPos: Vec3d,
  max: number,
  skip?: (t: Target) => boolean,
): NearStar[] {
  const out: NearStar[] = [];
  for (const t of targets) {
    if (skip?.(t)) continue;
    const brightness = apparentBrightness(t.lum, distance(t.pos, camPos));
    if (brightness < VISIBLE) continue;
    out.push({
      rel: sub(t.pos, camPos),
      brightness,
      material: t.material,
      size: starSize(brightness),
    });
  }
  out.sort((a, b) => b.brightness - a.brightness);
  return out.slice(0, max);
}

/** A distance for the HUD: '0.4 LY', '12 LY', '2,600 LY', '27.0 KLY'. */
export function formatDistance(kly: number): string {
  const ly = kly * LY_PER_KLY;
  if (ly < 10) return `${ly.toFixed(1)} LY`;
  if (ly < 10000) return `${Math.round(ly).toLocaleString('en-US')} LY`;
  return `${kly.toFixed(1)} KLY`;
}
