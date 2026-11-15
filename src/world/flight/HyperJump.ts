import { add, distance, normalize, scale, sub, type Vec3d } from '@/world/math';

/** Seconds of turning to face the target before the jump. */
export const ALIGN_S = 0.8;

/**
 * A hyperspace jump: a few seconds of very fast, eased straight-line travel that stops short of
 * the target. Longer trips take a little longer (log of the distance), never more than ~6 s, so a
 * hop to the next star and a crossing of the galaxy both feel like a jump, not a commute.
 */
export class HyperJump {
  readonly from: Vec3d;
  readonly to: Vec3d;
  readonly duration: number;
  private t = 0;

  /** Stops `standOff` short of `target`, on the line from `from`. Units are the layer's. */
  constructor(from: Vec3d, target: Vec3d, standOff: number, lightYearsPerUnit = 1000) {
    const dir = normalize(sub(target, from));
    const span = Math.max(0, distance(from, target) - standOff);
    this.from = from;
    this.to = add(from, scale(dir, span));
    const ly = Math.max(1, span * lightYearsPerUnit);
    this.duration = Math.min(6, 2 + 0.9 * Math.log10(ly));
  }

  get done(): boolean {
    return this.t >= this.duration;
  }

  /** 0…1 through the jump. */
  get progress(): number {
    return Math.min(1, this.t / this.duration);
  }

  /** Advances; returns the position and velocity now. */
  step(dt: number): { pos: Vec3d; vel: Vec3d } {
    this.t = Math.min(this.duration, this.t + dt);
    const u = this.progress;
    // smootherstep: gentle at both ends, so the ship eases out and drops back into normal space
    const e = u * u * u * (u * (u * 6 - 15) + 10);
    const de = (30 * u * u * (u - 1) * (u - 1)) / this.duration;
    const span = sub(this.to, this.from);
    return { pos: add(this.from, scale(span, e)), vel: scale(span, de) };
  }
}
