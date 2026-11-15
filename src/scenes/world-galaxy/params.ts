import type { ParamSchema, ParamValues } from '@/engine/scene/params';

/** Open-world galaxy knobs (the Milky Way's look, minus spin: here the galaxy holds still). */
export const WORLD_GALAXY_PARAMS = {
  /** Overall brightness of the galaxy's glow seen from inside it. */
  glow: {
    kind: 'number',
    label: 'GLOW',
    default: 0.12,
    min: 0.02,
    max: 0.6,
    step: 0.01,
    digits: 2,
  },
  /** Above 1, faint haze darkens faster than the bright band does. */
  contrast: {
    kind: 'number',
    label: 'CONTRAST',
    default: 1.25,
    min: 0.8,
    max: 2.5,
    step: 0.05,
    digits: 1,
  },
  armContrast: {
    kind: 'number',
    label: 'ARMS',
    default: 1,
    min: 0,
    max: 2,
    step: 0.05,
    digits: 2,
  },
  /** Lighter than the overview's: from inside, real dust hides most of the galaxy (the core too). */
  dust: { kind: 'number', label: 'DUST', default: 0.35, min: 0, max: 2, step: 0.05, digits: 2 },
  starDensity: {
    kind: 'number',
    label: 'STARS',
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
    digits: 2,
  },
} satisfies ParamSchema;

export type WorldGalaxyParams = ParamValues<typeof WORLD_GALAXY_PARAMS>;
