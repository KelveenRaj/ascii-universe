import type { ParamSchema, ParamValues } from '@/engine/scene/params';

/** Black hole knobs. Units: Schwarzschild radii (r_s = 1, ISCO = 3). */
export const BLACK_HOLE_PARAMS = {
  /**
   * How the gas is modelled. 'riaf': a thick, optically thin hot flow emitting along every ray,
   * like the semi-analytic models used on EHT data. 'thin': the older infinitely thin disk.
   */
  flow: {
    kind: 'choice',
    label: 'FLOW',
    default: 'riaf',
    options: [
      { value: 'riaf', label: 'THICK (RIAF)' },
      { value: 'thin', label: 'THIN DISK' },
    ],
  },
  /** A flaring hot spot orbiting just outside the ISCO, after GRAVITY 2018 (RIAF flow only). */
  hotspot: { kind: 'boolean', label: 'HOT SPOT', default: true },
  /** Disk animation speed multiplier (1 = physical Keplerian rate in r_s/c units per second). */
  diskSpeed: { kind: 'number', label: 'DISK SPEED', default: 6, min: 0, max: 30, step: 0.5 },
  /**
   * Observed intensity ∝ g^beaming (g = Doppler × gravitational shift). For the RIAF this is
   * 3 + α with spectral index α ≈ 0 near 230 GHz; 4 is bolometric.
   */
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
  /** RIAF scale height over cylindrical radius, H/ρ (Broderick & Loeb 2006 use 1). */
  thickness: {
    kind: 'number',
    label: 'THICKNESS',
    default: 1,
    min: 0.1,
    max: 1.5,
    step: 0.05,
    digits: 2,
    hidden: true,
  },
  /** Thin disk inner radius (ISCO = 3). */
  diskInner: {
    kind: 'number',
    label: 'DISK INNER',
    default: 3,
    min: 1.6,
    max: 8,
    step: 0.1,
    hidden: true,
  },
  /** Outer edge of the thin disk, and where the RIAF's emission tapers off. */
  diskOuter: {
    kind: 'number',
    label: 'DISK OUTER',
    default: 12,
    min: 6,
    max: 30,
    step: 0.5,
    hidden: true,
  },
} as const satisfies ParamSchema;

export type BlackHoleParams = ParamValues<typeof BLACK_HOLE_PARAMS>;
