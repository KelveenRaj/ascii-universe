import * as THREE from 'three';
import { projectToGrid } from '@/engine/display/labels';
import type { TextLayer, TextStyle } from '@/engine/display/TextLayer';
import type { ShipDesign, TrailGlyphId } from '@/world/ship/design';

/*
 * Slingshot's little text ship, and the open world's engine trail. (Your ship in the open world is
 * a 3D mesh now: model.ts and ShipPass.ts.)
 */

/** One cell of a sprite: offset from the ship's cell (row down), character, style. */
type Cell = [dc: number, dr: number, ch: string, style: TextStyle];

/**
 * The ship seen side-on, by the screen direction it flies in (0 = right, then counter-clockwise in
 * 45° steps). Nose, hull, engine block and two swept fins.
 */
export const SIDE: Cell[][] = [
  // →
  [
    [1, 0, '>', 'bright'],
    [0, 0, 'O', 'bright'],
    [-1, 0, '=', 'normal'],
    [-1, -1, '\\', 'normal'],
    [-1, 1, '/', 'normal'],
  ],
  // ↗
  [
    [1, -1, '/', 'bright'],
    [0, 0, 'O', 'bright'],
    [-1, 1, '=', 'normal'],
    [-1, 0, '-', 'normal'],
    [0, 1, '|', 'normal'],
  ],
  // ↑
  [
    [0, -1, '^', 'bright'],
    [0, 0, 'O', 'bright'],
    [0, 1, '|', 'normal'],
    [-1, 1, '/', 'normal'],
    [1, 1, '\\', 'normal'],
  ],
  // ↖
  [
    [-1, -1, '\\', 'bright'],
    [0, 0, 'O', 'bright'],
    [1, 1, '=', 'normal'],
    [1, 0, '-', 'normal'],
    [0, 1, '|', 'normal'],
  ],
  // ←
  [
    [-1, 0, '<', 'bright'],
    [0, 0, 'O', 'bright'],
    [1, 0, '=', 'normal'],
    [1, -1, '/', 'normal'],
    [1, 1, '\\', 'normal'],
  ],
  // ↙
  [
    [-1, 1, '/', 'bright'],
    [0, 0, 'O', 'bright'],
    [1, -1, '=', 'normal'],
    [1, 0, '-', 'normal'],
    [0, -1, '|', 'normal'],
  ],
  // ↓
  [
    [0, 1, 'v', 'bright'],
    [0, 0, 'O', 'bright'],
    [0, -1, '|', 'normal'],
    [-1, -1, '\\', 'normal'],
    [1, -1, '/', 'normal'],
  ],
  // ↘
  [
    [1, 1, '\\', 'bright'],
    [0, 0, 'O', 'bright'],
    [-1, -1, '=', 'normal'],
    [-1, 0, '-', 'normal'],
    [0, -1, '|', 'normal'],
  ],
];

/** Screen steps for the 8 directions (row down). */
const STEP: Array<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** Flying away from the camera: the engine end, wings out. */
const REAR: Cell[] = [
  [-1, -1, '/', 'normal'],
  [0, -1, '^', 'bright'],
  [1, -1, '\\', 'normal'],
  [-2, 0, '<', 'normal'],
  [-1, 0, '=', 'normal'],
  [0, 0, 'O', 'bright'],
  [1, 0, '=', 'normal'],
  [2, 0, '>', 'normal'],
];

/** Flying towards the camera: the nose end. */
const FRONT: Cell[] = [
  [-2, 0, '<', 'normal'],
  [-1, 0, '=', 'normal'],
  [0, 0, 'O', 'bright'],
  [1, 0, '=', 'normal'],
  [2, 0, '>', 'normal'],
  [-1, 1, '\\', 'normal'],
  [0, 1, 'v', 'bright'],
  [1, 1, '/', 'normal'],
];

/** Above this share of the motion along the view axis, the ship is seen end-on. */
const END_ON = 0.85;

const local = new THREE.Vector3();
const toCamera = new THREE.Matrix3();

/**
 * How the ship looks from this camera: one of the 8 side views (index into SIDE), or end-on.
 * `velocity` is a world direction.
 */
export function shipPose(
  velocity: THREE.Vector3,
  camera: THREE.Camera,
): { kind: 'side'; dir: number } | { kind: 'rear' | 'front' } {
  toCamera.setFromMatrix4(camera.matrixWorldInverse);
  local.copy(velocity).applyMatrix3(toCamera).normalize();
  if (local.z < -END_ON) return { kind: 'rear' };
  if (local.z > END_ON) return { kind: 'front' };
  // screen angle, y up; 8 sectors centred on the axes
  const angle = Math.atan2(local.y, local.x);
  const dir = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
  return { kind: 'side', dir };
}

/**
 * Draws the ship at world `position`, flying along world `velocity`. While `burning`, a flickering
 * exhaust comes out of the engine (`frame` drives the flicker).
 */
export function drawShip(
  text: TextLayer,
  camera: THREE.Camera,
  tanHalfFov: number,
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  burning: boolean,
  frame: number,
): void {
  const at = projectToGrid(position, camera, tanHalfFov, text.cols, text.rows);
  if (!at) return;
  const pose = shipPose(velocity, camera);
  const flicker = frame % 2 === 0;
  const cells: Cell[] =
    pose.kind === 'side' ? [...SIDE[pose.dir]] : [...(pose.kind === 'rear' ? REAR : FRONT)];

  if (burning) {
    if (pose.kind === 'side') {
      const [dc, dr] = STEP[pose.dir];
      // behind the engine block (which is one step back from the hull)
      cells.push([-2 * dc, -2 * dr, flicker ? '*' : '~', 'accent']);
      cells.push([-3 * dc, -3 * dr, flicker ? '.' : '*', 'accent']);
    } else if (pose.kind === 'rear') {
      cells.push([0, 1, flicker ? '*' : '+', 'accent']);
      cells[5] = [0, 0, '@', 'accent']; // the engine glows
    }
  }
  for (const [dc, dr, ch, style] of cells) text.put(at.col + dc, at.row + dr, ch, style);
}

const TRAIL_CHARS: Record<TrailGlyphId, [string, string]> = {
  dots: ['.', '.'],
  dashes: ['-', '-'],
  stars: ['*', '+'],
  sparks: ['+', "'"],
};

/**
 * The engine trail: where the ship has been, sampled as it flies and drawn as fading glyphs in
 * the trail's colour. Positions are world points in the layer's units (the engine's, as it
 * flies); reset on a layer change.
 */
export class Trail {
  private readonly points: THREE.Vector3[] = [];
  private head = 0;
  private count = 0;
  private sinceSample = 0;

  constructor(capacity = 24) {
    for (let i = 0; i < capacity; i++) this.points.push(new THREE.Vector3());
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
    this.sinceSample = 0;
  }

  /** Samples the ship's position every `every` seconds while it moves. */
  update(dt: number, position: THREE.Vector3, moving: boolean, every = 0.12): void {
    if (!moving) {
      // a parked ship's trail drains away
      this.sinceSample += dt;
      if (this.sinceSample >= every && this.count > 0) {
        this.count--;
        this.sinceSample = 0;
      }
      return;
    }
    this.sinceSample += dt;
    if (this.sinceSample < every && this.count > 0) return;
    this.sinceSample = 0;
    this.points[this.head].copy(position);
    this.head = (this.head + 1) % this.points.length;
    this.count = Math.min(this.points.length, this.count + 1);
  }

  /** Newest first, up to `max` points (the design's trail length). */
  draw(
    text: TextLayer,
    camera: THREE.Camera,
    tanHalfFov: number,
    trail: ShipDesign['trail'],
    /** Cells the ship covers on screen (inclusive), kept clear of trail glyphs. */
    ship: { col0: number; row0: number; col1: number; row1: number } | null,
  ): void {
    const max = [0, 12, 24][trail.length];
    const n = Math.min(this.count, max);
    const [near, far] = TRAIL_CHARS[trail.glyph];
    for (let i = 0; i < n; i++) {
      const p = this.points[(this.head - 1 - i + this.points.length * 2) % this.points.length];
      const g = projectToGrid(p, camera, tanHalfFov, text.cols, text.rows);
      if (!g) continue;
      // never over the ship itself
      if (
        ship &&
        g.col >= ship.col0 &&
        g.col <= ship.col1 &&
        g.row >= ship.row0 &&
        g.row <= ship.row1
      ) {
        continue;
      }
      const older = i > n / 2;
      text.put(g.col, g.row, older ? far : near, older ? 'dim' : `swatch:${trail.color}`);
    }
  }
}
