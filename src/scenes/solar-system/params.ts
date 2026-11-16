import type { ParamSchema, ParamValues } from '@/engine/scene/params';

/** Solar System knobs. */
export const SOLAR_SYSTEM_PARAMS = {
  /** Real distances instead of the squeezed ones (sizes are always true). */
  trueScale: { kind: 'boolean', label: 'TRUE DISTANCES', default: false },
  /** Days of simulated time per real second; 0 freezes the clock. */
  timeRate: {
    kind: 'number',
    label: 'DAYS / SEC',
    default: 0.01,
    min: 0,
    max: 30,
    step: 0.01,
    digits: 2,
  },
  /** Exposure for sunlit surfaces (like a camera, it adjusts to the body you're looking at). */
  daylight: {
    kind: 'number',
    label: 'DAYLIGHT',
    default: 1,
    min: 0.3,
    max: 3,
    step: 0.05,
    digits: 2,
  },
  /** The Sun's corona. */
  corona: {
    kind: 'number',
    label: 'CORONA',
    default: 1,
    min: 0,
    max: 3,
    step: 0.05,
    digits: 2,
  },
  starDensity: {
    kind: 'number',
    label: 'STARS',
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
    digits: 2,
  },
} satisfies ParamSchema;

export type SolarSystemParams = ParamValues<typeof SOLAR_SYSTEM_PARAMS>;
