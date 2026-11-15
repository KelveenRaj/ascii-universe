import * as THREE from 'three';
import { projectToGrid } from '@/engine/display/labels';
import type { TextLayer, TextStyle } from '@/engine/display/TextLayer';

/** One cell of a sprite: offset from the ship's cell (row down), character, style. */
type Cell = [dc: number, dr: number, ch: string, style: TextStyle];

/**
 * The ship seen side-on, by the screen direction it flies in (0 = right, then counter-clockwise in
 * 45° steps). Nose, hull, engine block and two swept fins.
 */
const SIDE: Cell[][] = [
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
