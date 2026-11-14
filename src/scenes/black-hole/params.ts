import type { ParamSchema, ParamValues } from '@/engine/scene/params';

/** Black hole knobs. Units: Schwarzschild radii (r_s = 1, ISCO = 3). */
export const BLACK_HOLE_PARAMS = {
  /** Disk animation speed multiplier (1 = physical Keplerian rate in r_s/c units per second). */
  diskSpeed: { kind: 'number', label: 'DISK SPEED', default: 6, min: 0, max: 30, step: 0.5 },
  /** Observed intensity ∝ g^beaming (g = Doppler × gravitational redshift). 4 is bolometric. */
  beaming: { kind: 'number', label: 'BEAMING', default: 3, min: 0, max: 6, step: 0.1 },
  /** 0..1 fraction of grid cells that hold a star. */
  starDensity: {
    kind: 'number',
    label: 'STARS',
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
    digits: 2,
  },
  /** Disk inner radius (ISCO = 3). */
  diskInner: {
    kind: 'number',
    label: 'DISK INNER',
    default: 3,
    min: 1.6,
    max: 8,
    step: 0.1,
    hidden: true,
  },
  diskOuter: {
    kind: 'number',
    label: 'DISK OUTER',
    default: 12,
    min: 6,
    max: 30,
    step: 0.5,
    hidden: true,
  },
} satisfies ParamSchema;

export type BlackHoleParams = ParamValues<typeof BLACK_HOLE_PARAMS>;
