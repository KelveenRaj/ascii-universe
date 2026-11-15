import { TEXT_CHARS } from '@/engine/display/glyphs/ramps';

/**
 * A pilot's ship as they designed it in the hangar: three parts, a colour, an engine trail and a
 * name. This is what gets saved (and later synced), so it only holds ids; the part sprites live in
 * code (parts.ts, W4) and can be redrawn without touching saves.
 */
export const HULLS = ['dart', 'arrow', 'hauler', 'saucer'] as const;
export const WINGS = ['swept', 'delta', 'stub', 'ring'] as const;
export const ENGINES = ['ion', 'twin', 'fusion', 'sail'] as const;
/** Colour swatches. The text layer gets one style per swatch (W4). */
export const SHIP_COLORS = [
  'white',
  'amber',
  'orange',
  'red',
  'magenta',
  'violet',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'gold',
] as const;
export const TRAIL_GLYPHS = ['dots', 'dashes', 'stars', 'sparks'] as const;

export type HullId = (typeof HULLS)[number];
export type WingsId = (typeof WINGS)[number];
export type EngineId = (typeof ENGINES)[number];
export type ShipColorId = (typeof SHIP_COLORS)[number];
export type TrailGlyphId = (typeof TRAIL_GLYPHS)[number];

export interface ShipDesign {
  v: 1;
  name: string;
  hull: HullId;
  wings: WingsId;
  engine: EngineId;
  color: ShipColorId;
  trail: { glyph: TrailGlyphId; color: ShipColorId; length: 0 | 1 | 2 };
}

export const NAME_MAX = 16;

export const DEFAULT_SHIP: ShipDesign = {
  v: 1,
  name: 'WANDERER',
  hull: 'dart',
  wings: 'swept',
  engine: 'ion',
  color: 'white',
  trail: { glyph: 'dots', color: 'amber', length: 1 },
};

const DRAWABLE = new Set(TEXT_CHARS.slice(0, 95)); // printable ASCII; brackets are for markers

/**
 * A name as typed into the HUD/grid: trimmed, upper-cased (the 8×8 font reads best that way),
 * only characters the text layer can draw, at most `max` long. Empty if nothing usable is left.
 */
export function cleanName(raw: unknown, max = NAME_MAX): string {
  if (typeof raw !== 'string') return '';
  const chars = [...raw.toUpperCase()].filter((ch) => DRAWABLE.has(ch));
  return chars.join('').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;

/** A design read from untrusted data, with every unknown or missing field replaced by the default. */
export function sanitizeShip(raw: unknown): ShipDesign {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const t = (r.trail && typeof r.trail === 'object' ? r.trail : {}) as Record<string, unknown>;
  const d = DEFAULT_SHIP;
  return {
    v: 1,
    name: cleanName(r.name) || d.name,
    hull: oneOf(HULLS, r.hull, d.hull),
    wings: oneOf(WINGS, r.wings, d.wings),
    engine: oneOf(ENGINES, r.engine, d.engine),
    color: oneOf(SHIP_COLORS, r.color, d.color),
    trail: {
      glyph: oneOf(TRAIL_GLYPHS, t.glyph, d.trail.glyph),
      color: oneOf(SHIP_COLORS, t.color, d.trail.color),
      length: t.length === 0 || t.length === 1 || t.length === 2 ? t.length : d.trail.length,
    },
  };
}
