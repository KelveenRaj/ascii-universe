import type { ShipDesign } from '@/world/ship/design';
import {
  ENGINE_PARTS,
  HULL_PARTS,
  WING_PARTS,
  type AxisCell,
  type Glyph,
  type ScreenCell,
} from '@/world/ship/parts';

/** Screen steps for the 8 side-view directions (0 = flying right, then counter-clockwise; row down). */
export const STEP: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const NOSE = ['>', '/', '^', '\\', '<', '/', 'v', '\\'];
const LINES = ['-', '/', '|', '\\'];

/** The 10 ways a ship can look, cells relative to its centre cell. */
export interface ShipViews {
  /** Seen side-on, by screen direction (see STEP). */
  side: ScreenCell[][];
  /** Seen from behind (flying away) and ahead (flying at you). */
  rear: ScreenCell[];
  front: ScreenCell[];
  /** Where the exhaust goes: two cells per side direction, nearest first; and below, from behind. */
  exhaustSide: Array<Array<readonly [number, number]>>;
  exhaustRear: Array<readonly [number, number]>;
}

/** The character a stroke along screen vector (dc, dr) looks like. */
function lineChar(dc: number, dr: number): string {
  let angle = Math.atan2(-dr, dc); // y up
  if (angle < 0) angle += Math.PI;
  return LINES[Math.round(angle / (Math.PI / 4)) % 4];
}

function glyphFor(
  g: Glyph,
  dir: number,
  F: readonly [number, number],
  L: readonly [number, number],
) {
  if (g === 'nose') return NOSE[dir];
  if (g === 'block') return dir % 4 === 2 ? '|' : '=';
  if (typeof g === 'string') return g;
  const [, a, s] = g;
  return lineChar(a * F[0] + s * L[0], a * F[1] + s * L[1]);
}

/**
 * The screen cell for axis position (a, s) flying in direction `dir`. On the diagonals a sideways
 * step is a diagonal too, so it's halved (a full one would splay the wings two cells out) and the
 * half-cells are rounded towards the ship's centre, which reproduces the hand-drawn diagonal
 * sprite exactly; next to the centre they're rounded outwards instead, so they don't land on it.
 */
export function axisToCell(dir: number, a: number, s: number): [number, number] {
  const F = STEP[dir];
  const L = STEP[(dir + 2) % 8];
  const k = dir % 2 === 1 ? 0.5 : 1;
  const x = a * F[0] + s * L[0] * k;
  const y = a * F[1] + s * L[1] * k;
  let dc = Math.trunc(x);
  let dr = Math.trunc(y);
  if (dc === 0 && dr === 0 && (x !== 0 || y !== 0)) {
    dc = Math.sign(x) * Math.ceil(Math.abs(x));
    dr = Math.sign(y) * Math.ceil(Math.abs(y));
  }
  return [dc + 0, dr + 0];
}

/** Lays axis cells out for one direction; later cells win where they overlap. */
function layout(dir: number, groups: Array<{ cells: AxisCell[]; shift: number }>): ScreenCell[] {
  const F = STEP[dir];
  const L = STEP[(dir + 2) % 8];
  const out = new Map<string, ScreenCell>();
  for (const { cells, shift } of groups) {
    for (const { a, s, glyph, tone } of cells) {
      const [dc, dr] = axisToCell(dir, a + shift, s);
      out.set(`${dc},${dr}`, { dc, dr, ch: glyphFor(glyph, dir, F, L), tone });
    }
  }
  return [...out.values()];
}

const FLIP: Record<string, string> = { '^': 'v', v: '^', '/': '\\', '\\': '/', "'": '.', '.': "'" };

function merge(...groups: ScreenCell[][]): ScreenCell[] {
  const out = new Map<string, ScreenCell>();
  for (const g of groups) for (const cell of g) out.set(`${cell.dc},${cell.dr}`, cell);
  return [...out.values()];
}

/** Puts a design's parts together in all 10 views. */
export function composeShip(design: Pick<ShipDesign, 'hull' | 'wings' | 'engine'>): ShipViews {
  const hull = HULL_PARTS[design.hull];
  const wings = WING_PARTS[design.wings];
  const engine = ENGINE_PARTS[design.engine];
  const side = STEP.map((_, dir) =>
    // the hull last, so it's never covered
    layout(dir, [
      { cells: wings.side, shift: hull.tail },
      { cells: engine.side, shift: hull.tail },
      { cells: hull.side, shift: 0 },
    ]),
  );
  const exhaustA = hull.tail - engine.length - 1;
  const exhaustSide = STEP.map(([fc, fr]) => [
    [exhaustA * fc, exhaustA * fr] as const,
    [(exhaustA - 1) * fc, (exhaustA - 1) * fr] as const,
  ]);
  const rear = merge(wings.rear, engine.rear, hull.rear);
  // from ahead: the same silhouette upside down, engines hidden behind the hull
  const front = merge(wings.rear, hull.rear).map((cell) => ({
    ...cell,
    dr: -cell.dr,
    ch: FLIP[cell.ch] ?? cell.ch,
  }));
  const lowest = Math.max(...rear.filter((c) => c.dc === 0).map((c) => c.dr));
  return {
    side,
    rear,
    front,
    exhaustSide,
    exhaustRear: [
      [0, lowest + 1],
      [0, lowest + 2],
    ],
  };
}

const cache = new Map<string, ShipViews>();

/** composeShip, remembered per design (it's asked every frame). */
export function shipViews(design: Pick<ShipDesign, 'hull' | 'wings' | 'engine'>): ShipViews {
  const key = `${design.hull}/${design.wings}/${design.engine}`;
  let views = cache.get(key);
  if (!views) {
    views = composeShip(design);
    cache.set(key, views);
  }
  return views;
}
