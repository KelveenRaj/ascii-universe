import * as THREE from 'three';
import { projectToGrid } from '@/engine/display/labels';
import type { TextLayer } from '@/engine/display/TextLayer';
import { add, length, normalize, scale, sub, type Vec3d } from '@/world/math';
import { mulberry32, type Rng } from '@/world/rng';

/**
 * Specks drifting past the ship, so you can feel your speed: from inside the galaxy its glow
 * barely moves, even at hundreds of light-years a second. Positions are relative to the ship,
 * which keeps them small and exact however far out you are. Specks that fall behind come back in
 * ahead. Drawn as dots, or as streaks along their motion on screen once they move fast.
 */
export class SpaceDust {
  /** Positions relative to the ship. */
  readonly specks: Vec3d[] = [];
  private readonly rng: Rng;
  private readonly radius: number;
  private readonly world = new THREE.Vector3();
  private readonly behind = new THREE.Vector3();

  /** `radius`: how far around the ship specks live, in the layer's units. */
  constructor(radius: number, count = 70, seed = 1) {
    this.radius = radius;
    this.rng = mulberry32(seed);
    for (let i = 0; i < count; i++) this.specks.push(this.inBall());
  }

  private inBall(): Vec3d {
    for (;;) {
      const p: Vec3d = [this.rng() * 2 - 1, this.rng() * 2 - 1, this.rng() * 2 - 1];
      if (length(p) <= 1) return scale(p, this.radius);
    }
  }

  /** Moves the specks past a ship flying at `velocity`. */
  update(dt: number, velocity: Vec3d): void {
    if (dt <= 0) return;
    const shift = scale(velocity, -dt);
    const ahead = normalize(velocity);
    const moving = length(velocity) > 0;
    for (let i = 0; i < this.specks.length; i++) {
      const p = add(this.specks[i], shift);
      if (length(p) <= this.radius) {
        this.specks[i] = p;
        continue;
      }
      // fell out of range: re-enter on the far side, ahead of the ship if it's moving
      const fresh = this.inBall();
      // (0.55 + 0.45 = 1: always back inside the radius)
      this.specks[i] = moving ? add(scale(ahead, this.radius * 0.55), scale(fresh, 0.45)) : fresh;
    }
  }

  /** Draws the specks around world position `ship`. */
  draw(
    text: TextLayer,
    camera: THREE.Camera,
    tanHalfFov: number,
    ship: Vec3d,
    velocity: Vec3d,
  ): void {
    // where each speck was a moment ago, to see how fast it crosses the screen
    const trail = scale(velocity, 0.06);
    for (const p of this.specks) {
      const at = add(ship, p);
      this.world.set(at[0], at[1], at[2]);
      const now = projectToGrid(this.world, camera, tanHalfFov, text.cols, text.rows);
      if (!now) continue;
      const back = sub(at, trail);
      this.behind.set(back[0], back[1], back[2]);
      const then = projectToGrid(this.behind, camera, tanHalfFov, text.cols, text.rows);
      let ch = '.';
      if (then) {
        const dc = now.col - then.col;
        const dr = now.row - then.row;
        if (Math.abs(dc) + Math.abs(dr) >= 2) ch = streak(dc, dr);
      }
      text.put(now.col, now.row, ch, 'dim');
    }
  }
}

/** A streak character for screen motion (dc right, dr down). */
function streak(dc: number, dr: number): string {
  const angle = Math.atan2(-dr, dc); // y up
  const sector = (Math.round(angle / (Math.PI / 4)) + 8) % 4;
  return ['-', '/', '|', '\\'][sector];
}
