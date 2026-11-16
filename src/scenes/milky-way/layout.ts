import * as THREE from 'three';

/**
 * The Milky Way's shape, from published models (sources on the info card,
 * src/content/bodies/milky-way.ts):
 *
 * - spiral arms: Reid et al. 2019, ApJ 885, 131, Table 2 (log-periodic spirals with one "kink",
 *   fitted to maser parallaxes of massive young stars)
 * - disks, boxy/peanut bulge, long bar, nuclear disk: Bland-Hawthorn & Gerhard 2016, ARA&A 54, 529
 * - dust layer: Drimmel & Spergel 2001, ApJ 556, 181
 * - central molecular zone: Henshaw et al. 2023, Protostars and Planets VII
 *
 * Scene units are thousands of light-years (kly). The papers work in kpc with R0 (Sun to centre)
 * of 8.15 kpc (Reid) or 8.2 kpc (BHG); the card gives 27 kly (GRAVITY 2021). Every length here is
 * converted with KPC = sunRadius / 8.15, i.e. the whole model is scaled by 1.6% so the arms keep
 * their published position relative to the Sun.
 *
 * Frame: galactic centre at the origin, disk in XZ, Sun on +Z. Galactocentric azimuth β (Reid's:
 * 0 towards the Sun, growing in the direction of Galactic rotation, i.e. towards l = 90°) points
 * towards +X here, matching how src/world/landmarks.ts places stars by galactic longitude. So a
 * galaxy-frame angle θ = atan2(z, x) is β = π/2 − θ.
 *
 * galaxy.glsl reads all of this as GLSL constants (galaxyLayoutGlsl below); the CPU density for
 * placing star systems (src/world/gen/density.ts) reads it directly.
 */

const DEG = Math.PI / 180;
const SUN_RADIUS = 27;
/** kly per kpc, scaled so Reid's R0 = 8.15 kpc lands on the card's 27 kly. */
export const KPC = SUN_RADIUS / 8.15;

export const GALAXY = {
  /** Stellar disk ~100,000 ly across; the rendering stops here. */
  diskRadius: 50,
  /** Sun ~27,000 ly from the centre (GRAVITY 2021). */
  sunRadius: SUN_RADIUS,
  /** The Sun sits on the +Z axis of the galaxy's own frame. */
  sunAngle: Math.PI / 2,

  /** Thin disk: exponential scale length 2.6 kpc, scale height ~300 pc (BHG 2016 §5). */
  thinLength: 2.6 * KPC,
  thinHeight: 0.3 * KPC,
  /** Thick disk: scale length 2.0 kpc, scale height 900 pc, 4% of the thin disk's density at the Sun. */
  thickLength: 2.0 * KPC,
  thickHeight: 0.9 * KPC,
  thickFraction: 0.04,

  /** Boxy/peanut bulge, Wegg & Gerhard 2013 via BHG 2016 §4.2: major axis 27° from the Sun–centre line, near end at l > 0. */
  bulgeAngle: 27 * DEG,
  /** Exponential scale lengths along the bar, across it and vertically (0.70 : 0.44 : 0.18 kpc). */
  bulgeScale: [0.7 * KPC, 0.44 * KPC, 0.18 * KPC] as const,
  /** Where the X (peanut) shape is widest, along the major axis: 1.5 kpc. */
  bulgeXRadius: 1.5 * KPC,

  /** Long bar, Wegg, Gerhard & Portail 2015 via BHG 2016 §4.3: half-length 5.0 kpc at 28–33°. */
  barHalfLength: 5.0 * KPC,
  barAngle: 30 * DEG,
  /** Its thin (180 pc) and superthin (45 pc) components' scale heights. */
  barThinHeight: 0.18 * KPC,
  barSuperthinHeight: 0.045 * KPC,

  /** Nuclear stellar disk: scale height 45 pc, outer edge ~230 pc (BHG 2016 §4.1). */
  nsdRadius: 0.23 * KPC,
  nsdHeight: 0.045 * KPC,
  /** Central molecular zone: the molecular gas within R ~ 300 pc (Henshaw et al. 2023). */
  cmzRadius: 0.3 * KPC,

  /** Dust disk: scale length 0.28 R0, scale height 134 pc flaring to 188 pc at the Sun (Drimmel & Spergel 2001). */
  dustLength: 0.28 * SUN_RADIUS,
  dustHeightInner: 0.134 * KPC,
  dustHeightSun: 0.188 * KPC,
} as const;

/** A galaxy-frame angle θ (atan2(z, x)) for Reid's azimuth β, both radians. */
export const thetaOfBeta = (beta: number): number => Math.PI / 2 - beta;

/** β (degrees, 0–360) of a point (X, Y) in Reid et al.'s Fig. 1 frame: Sun at +Y, rotation towards +X. */
const reidBeta = (x: number, y: number): number => (Math.atan2(x, y) / DEG + 360) % 360;

/** One row of Reid et al. 2019 Table 2. Angles in degrees, lengths in kpc. */
interface ArmFit {
  /** Azimuth range covered by parallax data. */
  beta: readonly [number, number];
  kink: number;
  rKink: number;
  /** Pitch angles for β < kink and β > kink. */
  pitchBefore: number;
  pitchAfter: number;
  /** Intrinsic (Gaussian 1σ) width at the kink. */
  width: number;
}

export interface SpiralArm {
  id: string;
  /** Hub label, or null for no label. */
  label: string | null;
  /** Where along the arm the hub label sits (β, degrees). */
  labelBeta: number;
  fit: ArmFit;
  /**
   * How far the drawn arm runs beyond the parallax data, in degrees of β: below the range (outwards,
   * towards larger radii) and above it (inwards). The extrapolated part is drawn dimmer, fading out.
   */
  extend: readonly [number, number];
  /** A published change of pitch outside the fitted range: below `beta`, use `pitch`. */
  below?: { beta: number; pitch: number };
  /** Where the paper says the arm's inner end lies (β degrees, R kpc): joined to the fit's end by a straight log spiral. */
  innerEnd?: { beta: number; r: number };
  /** Relative brightness (1 for the major arms). */
  weight: number;
}

/**
 * Reid et al. 2019, Table 2, with the extensions their §3.2 describes: Norma wraps round the far
 * side and becomes the Outer arm; Scutum–Centaurus continues as the Outer Scutum–Centaurus arm;
 * Sagittarius–Carina's pitch drops to 10° beyond its 4th-quadrant tangency (β ≈ −33°) and it
 * reaches the bar near (X, Y) = (−3, −3) kpc; Perseus may start near (−3.5, −0.5) kpc.
 */
export const ARMS: readonly SpiralArm[] = [
  {
    id: 'scutum-centaurus',
    label: 'SCUTUM-CENTAURUS',
    labelBeta: -45,
    fit: {
      beta: [0, 104],
      kink: 23,
      rKink: 4.91,
      pitchBefore: 14.1,
      pitchAfter: 12.1,
      width: 0.23,
    },
    extend: [250, 20],
    weight: 1,
  },
  {
    id: 'sagittarius-carina',
    label: 'SAGITTARIUS-CARINA',
    labelBeta: -60,
    fit: { beta: [2, 97], kink: 24, rKink: 6.04, pitchBefore: 17.1, pitchAfter: 1.0, width: 0.27 },
    extend: [220, 0],
    below: { beta: -33, pitch: 10 },
    // (X, Y) = (−3, −3) kpc in Reid's Fig. 1 frame (Sun at +Y, rotation towards +X)
    innerEnd: { beta: reidBeta(-3, -3), r: Math.hypot(3, 3) },
    weight: 1,
  },
  {
    id: 'perseus',
    label: 'PERSEUS ARM',
    labelBeta: -10,
    fit: {
      beta: [-23, 115],
      kink: 40,
      rKink: 8.87,
      pitchBefore: 10.3,
      pitchAfter: 8.7,
      width: 0.35,
    },
    extend: [40, 0],
    innerEnd: { beta: reidBeta(-3.5, -0.5), r: Math.hypot(3.5, 0.5) },
    weight: 1,
  },
  {
    id: 'norma',
    label: 'NORMA ARM',
    labelBeta: 40,
    fit: { beta: [5, 54], kink: 18, rKink: 4.46, pitchBefore: -1.0, pitchAfter: 19.5, width: 0.14 },
    extend: [65, 15],
    weight: 1,
  },
  {
    id: 'outer',
    label: 'OUTER ARM',
    labelBeta: 30,
    fit: {
      beta: [-16, 71],
      kink: 18,
      rKink: 12.24,
      pitchBefore: 3.0,
      pitchAfter: 9.4,
      width: 0.65,
    },
    extend: [80, 0],
    // joins the Norma arm's outer end (β = −60° = 300°)
    innerEnd: { beta: 300, r: 4.46 * Math.exp(-(-60 - 18) * DEG * Math.tan(-1.0 * DEG)) },
    weight: 1,
  },
  {
    id: 'local',
    label: 'LOCAL ARM',
    labelBeta: 25,
    fit: { beta: [-8, 34], kink: 9, rKink: 8.26, pitchBefore: 11.4, pitchAfter: 11.4, width: 0.31 },
    extend: [15, 15],
    weight: 0.85,
  },
  {
    id: '3-kpc',
    label: null,
    labelBeta: 15,
    fit: {
      beta: [15, 18],
      kink: 15,
      rKink: 3.52,
      pitchBefore: -4.2,
      pitchAfter: -4.2,
      width: 0.18,
    },
    extend: [50, 40],
    weight: 0.5,
  },
];

/** Arm width grows 42 pc per kpc of radius (Reid et al. 2019, adopted from Reid et al. 2014). */
export const ARM_WIDTH_GROWTH = 0.042;
/** Brightness of an arm's extrapolated part, and the β span (degrees) over which its ends fade out. */
const EXTRAPOLATED = 0.6;
const END_FADE = 30;

/** ln R (R in kpc) of the arm's centre line at azimuth β (degrees), including the extensions. */
function lnRadiusKpc(arm: SpiralArm, beta: number): number {
  const f = arm.fit;
  const fitted = (b: number) =>
    Math.log(f.rKink) -
    (b - f.kink) * DEG * Math.tan((b < f.kink ? f.pitchBefore : f.pitchAfter) * DEG);
  if (arm.below && beta < arm.below.beta) {
    return fitted(arm.below.beta) - (beta - arm.below.beta) * DEG * Math.tan(arm.below.pitch * DEG);
  }
  if (arm.innerEnd && beta > f.beta[1]) {
    const a = fitted(f.beta[1]);
    const b = Math.log(arm.innerEnd.r);
    return a + ((beta - f.beta[1]) * (b - a)) / (arm.innerEnd.beta - f.beta[1]);
  }
  return fitted(beta);
}

/** Radius (kly) of an arm's centre line at azimuth β (degrees). */
export const armRadius = (arm: SpiralArm, beta: number): number =>
  Math.exp(lnRadiusKpc(arm, beta)) * KPC;

/** The β range (degrees) an arm is drawn over. */
export function armSpan(arm: SpiralArm): [number, number] {
  const [lo, hi] = arm.fit.beta;
  return [lo - arm.extend[0], arm.innerEnd ? arm.innerEnd.beta : hi + arm.extend[1]];
}

/**
 * A straight piece of an arm in (β, ln R), as galaxy.glsl and density.ts draw it. Angles radians,
 * lengths kly.
 */
export interface ArmSegment {
  /** β at the ends (b0 < b1, b1 − b0 ≤ 2π). */
  b0: number;
  b1: number;
  /** ln R at b0, and d(ln R)/dβ. */
  lnR0: number;
  slope: number;
  /** The arm's fitted (bright) range and drawn ends: brightness 1 inside [lo, hi], fading to 0 at the ends. */
  lo: number;
  hi: number;
  end0: number;
  end1: number;
  /** Gaussian 1σ width at rKink, growing by ARM_WIDTH_GROWTH per unit of radius. */
  width: number;
  rKink: number;
  weight: number;
}

/** Every arm cut into straight (β, ln R) pieces at its kinks and extension joints. */
export function armSegments(): ArmSegment[] {
  const out: ArmSegment[] = [];
  for (const arm of ARMS) {
    const [start, end] = armSpan(arm);
    const f = arm.fit;
    const breaks = [start, end, f.kink, f.beta[1]];
    if (arm.below) breaks.push(arm.below.beta);
    const cuts = [...new Set(breaks.filter((b) => b >= start && b <= end))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      // keep each piece under a full turn so the shader only has to try two windings
      const n = Math.ceil((cuts[i + 1] - cuts[i]) / 300);
      for (let j = 0; j < n; j++) {
        const a = cuts[i] + ((cuts[i + 1] - cuts[i]) * j) / n;
        const b = cuts[i] + ((cuts[i + 1] - cuts[i]) * (j + 1)) / n;
        const lnA = lnRadiusKpc(arm, a + 1e-9) + Math.log(KPC);
        const lnB = lnRadiusKpc(arm, b - 1e-9) + Math.log(KPC);
        out.push({
          b0: a * DEG,
          b1: b * DEG,
          lnR0: lnA,
          slope: (lnB - lnA) / ((b - a) * DEG),
          lo: f.beta[0] * DEG,
          hi: f.beta[1] * DEG,
          end0: start * DEG,
          end1: end * DEG,
          width: f.width * KPC,
          rKink: f.rKink * KPC,
          weight: arm.weight,
        });
      }
    }
  }
  return out;
}

/** Brightness along an arm at β (radians): 1 over the fitted range, dimmer beyond, fading at the ends. */
export function armStrength(s: ArmSegment, beta: number): number {
  if (beta >= s.lo && beta <= s.hi) return 1;
  const fade = END_FADE * DEG;
  const toEnd = beta < s.lo ? beta - s.end0 : s.end1 - beta;
  return EXTRAPOLATED * Math.min(1, Math.max(0, toEnd / fade));
}

const glslFloat = (x: number): string => {
  const s = x.toPrecision(7);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};
const vec4 = (a: number, b: number, c: number, d: number) =>
  `vec4(${[a, b, c, d].map(glslFloat).join(', ')})`;

/**
 * The layout as GLSL constants, for galaxy.glsl. Inserted into a fragment shader right after its
 * precision lines (see withGalaxyLayout).
 */
export function galaxyLayoutGlsl(): string {
  const g = GALAXY;
  const segs = armSegments();
  const consts: Array<[string, number]> = [
    ['G_DISK_RADIUS', g.diskRadius],
    ['G_SUN_RADIUS', g.sunRadius],
    ['G_KPC', KPC],
    ['G_THIN_LENGTH', g.thinLength],
    ['G_THIN_HEIGHT', g.thinHeight],
    ['G_THICK_LENGTH', g.thickLength],
    ['G_THICK_HEIGHT', g.thickHeight],
    ['G_THICK_FRACTION', g.thickFraction],
    ['G_BULGE_ANGLE', thetaOfBeta(g.bulgeAngle)],
    ['G_BULGE_X', g.bulgeScale[0]],
    ['G_BULGE_Y', g.bulgeScale[1]],
    ['G_BULGE_Z', g.bulgeScale[2]],
    ['G_BULGE_X_RADIUS', g.bulgeXRadius],
    ['G_BAR_ANGLE', thetaOfBeta(g.barAngle)],
    ['G_BAR_HALF_LENGTH', g.barHalfLength],
    ['G_BAR_THIN_HEIGHT', g.barThinHeight],
    ['G_BAR_SUPERTHIN_HEIGHT', g.barSuperthinHeight],
    ['G_NSD_RADIUS', g.nsdRadius],
    ['G_NSD_HEIGHT', g.nsdHeight],
    ['G_CMZ_RADIUS', g.cmzRadius],
    ['G_DUST_LENGTH', g.dustLength],
    ['G_DUST_HEIGHT_INNER', g.dustHeightInner],
    ['G_DUST_HEIGHT_SUN', g.dustHeightSun],
    ['G_ARM_WIDTH_GROWTH', ARM_WIDTH_GROWTH],
    ['G_ARM_EXTRAPOLATED', EXTRAPOLATED],
    ['G_ARM_END_FADE', END_FADE * DEG],
  ];
  const lines = consts.map(([name, v]) => `const float ${name} = ${glslFloat(v)};`);
  const n = segs.length;
  lines.push(`const int G_ARM_SEGMENTS = ${n};`);
  lines.push(
    `const vec4 G_ARM_SHAPE[${n}] = vec4[](${segs.map((s) => vec4(s.b0, s.b1, s.lnR0, s.slope)).join(', ')});`,
  );
  lines.push(
    `const vec4 G_ARM_RANGE[${n}] = vec4[](${segs.map((s) => vec4(s.lo, s.hi, s.end0, s.end1)).join(', ')});`,
  );
  // the radius band each segment can light up (centre line's range ± 4σ), for a cheap early-out
  const bands = segs.map((s) => {
    const ra = Math.exp(s.lnR0);
    const rb = Math.exp(s.lnR0 + s.slope * (s.b1 - s.b0));
    const wide = s.width + ARM_WIDTH_GROWTH * (Math.max(ra, rb) - s.rKink);
    const reach = 4 * wide * Math.sqrt(1 + s.slope * s.slope);
    return `vec2(${glslFloat(Math.min(ra, rb) - reach)}, ${glslFloat(Math.max(ra, rb) + reach)})`;
  });
  lines.push(`const vec2 G_ARM_BAND[${n}] = vec2[](${bands.join(', ')});`);
  lines.push(
    `const vec4 G_ARM_WIDTH[${n}] = vec4[](${segs.map((s) => vec4(s.width, s.rKink, s.weight, 0)).join(', ')});`,
  );
  return lines.join('\n');
}

const PRECISION = 'precision highp int;\n';

/** A fragment shader that includes galaxy.glsl, with the layout constants inserted. */
export function withGalaxyLayout(fragmentShader: string): string {
  const at = fragmentShader.indexOf(PRECISION);
  if (at < 0) throw new Error('withGalaxyLayout: the shader needs a "precision highp int;" line');
  const cut = at + PRECISION.length;
  return `${fragmentShader.slice(0, cut)}${galaxyLayoutGlsl()}\n${fragmentShader.slice(cut)}`;
}

/** Hub label positions: a point on each labelled arm, galaxy frame (kly, radians). */
export function armLabelPoints(): Array<{ text: string; radius: number; angle: number }> {
  return ARMS.filter((a) => a.label !== null).map((a) => ({
    text: a.label!,
    radius: armRadius(a, a.labelBeta),
    angle: thetaOfBeta(a.labelBeta * DEG),
  }));
}

/**
 * Where a point fixed in the galaxy (radius, angle in the galaxy's own frame) is in the world after
 * the galaxy has turned by `turned` radians. Matches rot(p.xz, uAngle) in galaxy.glsl.
 */
export function galaxyToWorld(
  radius: number,
  angle: number,
  turned: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const a = angle - turned;
  return out.set(radius * Math.cos(a), 0, radius * Math.sin(a));
}
