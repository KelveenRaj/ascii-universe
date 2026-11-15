import { add, length, normalize, scale, sub, type Vec3d } from '@/world/math';

/** Behind and above the ship, and the point ahead it looks at, in the layer's units. */
export interface ChaseRig {
  back: number;
  up: number;
  ahead: number;
}

/** How quickly the camera swings round behind the ship (1/s). */
const EASE = 5;

/**
 * Follows the ship from behind and a little above. The offset is eased in the ship's frame, not
 * in the world, so the camera keeps its distance at any speed and only swings out on turns, which
 * is what shows the ship banking.
 */
export class ChaseCamera {
  private offset: Vec3d | null = null;
  private upDir: Vec3d = [0, 1, 0];
  readonly rig: ChaseRig;

  constructor(rig: ChaseRig) {
    this.rig = rig;
  }

  /** Jumps straight to the resting position (after a spawn or a jump). */
  reset(): void {
    this.offset = null;
  }

  update(
    dt: number,
    ship: Vec3d,
    forward: Vec3d,
    up: Vec3d,
  ): { position: Vec3d; target: Vec3d; up: Vec3d } {
    const { back, up: rise, ahead } = this.rig;
    const want = add(scale(forward, -back), scale(up, rise));
    if (!this.offset) {
      this.offset = want;
      this.upDir = up;
    } else {
      const k = 1 - Math.exp(-EASE * dt);
      const eased = add(this.offset, scale(sub(want, this.offset), k));
      // keep the distance: easing between two directions would pull the camera in on turns
      this.offset = scale(normalize(eased), length(want));
      this.upDir = normalize(add(this.upDir, scale(sub(up, this.upDir), k)));
    }
    return {
      position: add(ship, this.offset),
      target: add(ship, scale(forward, ahead)),
      up: this.upDir,
    };
  }
}
