/** Character ramps, darkest first. Each is re-sorted by measured glyph coverage before use. */
export type RampId = 'classic' | 'dense' | 'blocks' | 'minimal';

export interface Ramp {
  id: RampId;
  label: string;
  chars: string;
}

export const RAMPS: Record<RampId, Ramp> = {
  classic: { id: 'classic', label: 'Classic', chars: ' .:-=+*#%@' },
  dense: {
    id: 'dense',
    label: 'Dense',
    // Paul Bourke's 70-level ramp, darkest first
    chars: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  },
  blocks: { id: 'blocks', label: 'Blocks', chars: ' ░▒▓█' },
  minimal: { id: 'minimal', label: 'Minimal', chars: ' .oO@' },
};

export const RAMP_IDS = Object.keys(RAMPS) as RampId[];

/** Stars get their own tiny ramp so they read as points, not as dim disk gas. */
export const STAR_RAMP = '.+*';

/**
 * Characters the text layer can draw (labels, HUD-in-the-grid, game sprites): printable ASCII,
 * then corner brackets for target markers. Code 0 in the text layer means "no text"; code i + 1 is
 * TEXT_CHARS[i].
 */
export const TEXT_CHARS = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  '┌',
  '┐',
  '└',
  '┘',
];

/** Unique characters in order of first appearance. */
export function uniqueChars(s: string): string[] {
  return [...new Set([...s])];
}

/**
 * Sorts a ramp by measured ink coverage (fraction of lit pixels), keeping a leading space first.
 * The sort is stable, so glyphs with equal coverage keep their authored order.
 */
export function sortByCoverage(chars: string[], coverage: (ch: string) => number): string[] {
  const head = chars[0] === ' ' ? [' '] : [];
  const rest = chars.slice(head.length);
  return [
    ...head,
    ...rest
      .map((ch, i) => ({ ch, i, c: coverage(ch) }))
      .sort((a, b) => a.c - b.c || a.i - b.i)
      .map((e) => e.ch),
  ];
}
