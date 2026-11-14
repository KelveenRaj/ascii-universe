import type { ParamSchema, ParamValues } from '@/engine/scene/params';

/** Milky Way knobs. Units: thousands of light-years. */
export const MILKY_WAY_PARAMS = {
  /** How fast the galaxy turns on screen, degrees per second (the real one: 360° in ~250 Myr). */
  spin: { kind: 'number', label: 'SPIN', default: 1.5, min: 0, max: 10, step: 0.5 },
  /** Brightness of the young stars and gas in the arms. */
  armContrast: {
    kind: 'number',
    label: 'ARMS',
    default: 1,
    min: 0,
    max: 2,
    step: 0.05,
    digits: 2,
  },
  /** Dust lane opacity. */
  dust: { kind: 'number', label: 'DUST', default: 1, min: 0, max: 2, step: 0.05, digits: 2 },
  starDensity: {
    kind: 'number',
    label: 'STARS',
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
    digits: 2,
  },
} satisfies ParamSchema;

export type MilkyWayParams = ParamValues<typeof MILKY_WAY_PARAMS>;
