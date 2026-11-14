import type { SceneId } from '@/scenes/registry';

/**
 * Factual content for every place you can visit, kept apart from the rendering code so the info
 * cards (and later the hub's map) can be written and checked without touching a shader.
 *
 * Rules (enforced by tests/content.test.ts):
 * - every fact cites one of the body's own sources
 * - sources are https links to the primary or official publication where there is one
 * - numbers that are derived rather than quoted say so in `detail`
 */

export type BodyKind = 'black-hole' | 'galaxy' | 'star' | 'planet' | 'moon' | 'nebula';

export interface Source {
  /** Short id facts point at, unique within the body. */
  id: string;
  title: string;
  /** Who published it: a journal, an agency, a collaboration. */
  publisher: string;
  year: number;
  url: string;
}

export interface Fact {
  /** Short and upper case, it sits in a narrow column: "MASS", "DISTANCE". */
  label: string;
  /** The headline value, as displayed: "4.30 MILLION SUNS". */
  value: string;
  /** One line of context: how it was measured, or what it means. */
  detail?: string;
  /** Id of the Source this comes from. */
  source: string;
}

export interface Body {
  /** Stable id, used in the URL: #/<id>. */
  id: string;
  name: string;
  /** Catalogue name or short form, e.g. "SGR A*". */
  designation?: string;
  kind: BodyKind;
  /** The scene that renders this body. */
  sceneId: SceneId;
  /** The body this one belongs to (a planet's star, a star's galaxy). */
  parent?: string;
  /** One line under the name. */
  tagline: string;
  /** A few short paragraphs. */
  summary: string[];
  facts: Fact[];
  sources: Source[];
}

/** How a kind reads on screen. */
export const KIND_LABELS: Record<BodyKind, string> = {
  'black-hole': 'BLACK HOLE',
  galaxy: 'GALAXY',
  star: 'STAR',
  planet: 'PLANET',
  moon: 'MOON',
  nebula: 'NEBULA',
};
