import type { ParamSchema, ParamValues } from '@/engine/scene/params';

/** Open-world star system knobs. */
export const WORLD_SYSTEM_PARAMS = {
  /** Brightness of the star's surface. */
  starGlow: {
    kind: 'number',
    label: 'STAR',
    default: 2.2,
    min: 0.5,
    max: 5,
    step: 0.1,
    digits: 1,
  },
  /** The glow around the star. */
  corona: {
    kind: 'number',
    label: 'CORONA',
    default: 0.8,
    min: 0,
    max: 3,
    step: 0.05,
    digits: 2,
  },
  /** How bright sunlit planets are. */
  daylight: {
    kind: 'number',
    label: 'DAYLIGHT',
    default: 1.1,
    min: 0.3,
    max: 3,
    step: 0.05,
    digits: 2,
  },
  /** A little light on night sides, so dark planets don't vanish entirely. */
  nightside: {
    kind: 'number',
    label: 'NIGHT SIDE',
    default: 0.04,
    min: 0,
    max: 0.3,
    step: 0.01,
    digits: 2,
  },
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

export type WorldSystemParams = ParamValues<typeof WORLD_SYSTEM_PARAMS>;
