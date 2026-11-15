import type { EngineId, HullId, WingsId } from '@/world/ship/design';

/**
 * Ship parts as little ASCII drawings, for compose.ts to put together in any of the 10 views.
 *
 * Side views are drawn in the ship's own axes, so one drawing covers all 8 screen directions:
 *   a  cells forward of the hull's centre (negative: behind)
 *   s  cells to the ship's left (seen side-on, flying right on screen, left is up)
 * and the glyph is a role, not a character, where it depends on the direction:
 *   'nose'          the point at the front: > ^ < v / \ by direction
 *   'block'         an engine block: = except upright, where it's |
 *   ['line', a, s]  a stroke along that axis direction: - | / \ by how it lies on screen
 *   any other string: that character as is (pick ones that look the same turned: O o @ # + . :)
 *
 * End-on views (seen from behind or ahead) are drawn straight in screen cells (dc right, dr
 * down), from behind; compose.ts flips them for the front.
 *
 * Tones: 'main' takes the ship's colour, 'trim' stays a quiet ink, 'glow' is the engine's accent.
 */
export type Tone = 'main' | 'trim' | 'glow';
export type Glyph = 'nose' | 'block' | readonly ['line', number, number] | string;
export interface AxisCell {
  a: number;
  s: number;
  glyph: Glyph;
  tone: Tone;
}
export interface ScreenCell {
  dc: number;
  dr: number;
  ch: string;
  tone: Tone;
}

export interface HullPart {
  label: string;
  side: AxisCell[];
  /** `a` of the hull's back end: wings and engine hang off this. */
  tail: number;
  rear: ScreenCell[];
}

export interface WingsPart {
  label: string;
  /** Relative to the hull's tail. */
  side: AxisCell[];
  rear: ScreenCell[];
}

export interface EnginePart {
  label: string;
  /** Relative to the hull's tail. */
  side: AxisCell[];
  /** Cells it adds behind the tail; the exhaust starts after them. */
  length: number;
  /** Seen from behind, under the hull. */
  rear: ScreenCell[];
}

const c = (a: number, s: number, glyph: Glyph, tone: Tone = 'main'): AxisCell => ({
  a,
  s,
  glyph,
  tone,
});
const r = (dc: number, dr: number, ch: string, tone: Tone = 'main'): ScreenCell => ({
  dc,
  dr,
  ch,
  tone,
});
/** Both sides of the ship. */
const pair = (a: number, s: number, glyph: (side: 1 | -1) => Glyph, tone?: Tone) => [
  c(a, s, glyph(1), tone),
  c(a, -s, glyph(-1), tone),
];
const mirror = (dc: number, dr: number, left: string, right: string, tone?: Tone) => [
  r(-dc, dr, left, tone),
  r(dc, dr, right, tone),
];

export const HULL_PARTS: Record<HullId, HullPart> = {
  dart: {
    label: 'DART',
    side: [c(1, 0, 'nose'), c(0, 0, 'O')],
    tail: 0,
    rear: [r(0, 0, 'O'), r(0, -1, '^', 'trim')],
  },
  arrow: {
    label: 'ARROW',
    side: [c(2, 0, 'nose'), c(1, 0, ['line', 1, 0]), c(0, 0, 'O')],
    tail: 0,
    rear: [r(0, 0, 'O'), r(0, -1, '|', 'trim'), r(0, -2, '^', 'trim')],
  },
  hauler: {
    label: 'HAULER',
    side: [c(1, 0, 'nose'), c(0, 0, '#'), c(-1, 0, '#')],
    tail: -1,
    rear: [r(0, 0, '#'), r(-1, 0, '['), r(1, 0, ']'), r(0, -1, '^', 'trim')],
  },
  saucer: {
    label: 'SAUCER',
    side: [c(1, 0, '.', 'trim'), c(0, 0, '@'), c(0, 1, 'o'), c(0, -1, 'o')],
    tail: 0,
    rear: [r(0, 0, '@'), ...mirror(1, 0, 'o', 'o')],
  },
};

export const WING_PARTS: Record<WingsId, WingsPart> = {
  swept: {
    label: 'SWEPT',
    side: pair(-1, 1, (s) => ['line', -1, s]),
    rear: [...mirror(1, 0, '=', '='), ...mirror(2, 0, '<', '>'), ...mirror(1, -1, '/', '\\')],
  },
  delta: {
    label: 'DELTA',
    side: [...pair(0, 1, (s) => ['line', -1, s]), ...pair(-1, 2, (s) => ['line', -1, s])],
    rear: [...mirror(1, 0, '=', '='), ...mirror(2, 0, '=', '='), ...mirror(3, 0, '<', '>')],
  },
  stub: {
    label: 'STUB',
    side: pair(0, 1, () => '+'),
    rear: mirror(1, 0, '+', '+'),
  },
  ring: {
    label: 'RING',
    side: [...pair(1, 1, () => '.'), ...pair(0, 1, () => 'o'), ...pair(-1, 1, () => '.')],
    rear: [...mirror(1, 0, '(', ')'), ...mirror(1, -1, '.', '.'), ...mirror(1, 1, "'", "'")],
  },
};

export const ENGINE_PARTS: Record<EngineId, EnginePart> = {
  ion: {
    label: 'ION',
    side: [c(-1, 0, 'block', 'trim')],
    length: 1,
    rear: [r(0, 1, '.', 'trim')],
  },
  twin: {
    label: 'TWIN',
    side: [c(-1, 0, ':', 'trim')],
    length: 1,
    rear: mirror(1, 1, '.', '.', 'trim'),
  },
  fusion: {
    label: 'FUSION',
    side: [c(-1, 0, 'block', 'trim'), c(-2, 0, '#', 'trim')],
    length: 2,
    rear: [r(0, 1, 'o', 'trim')],
  },
  sail: {
    label: 'SAIL',
    side: [c(-1, 0, ['line', 1, 0], 'trim'), c(-2, 0, ['line', 0, 1], 'main')],
    length: 2,
    rear: [r(0, 1, '+', 'trim')],
  },
};
