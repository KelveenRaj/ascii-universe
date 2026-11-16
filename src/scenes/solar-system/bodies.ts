import type { PlanetId } from '@/scenes/solar-system/ephemeris';

/**
 * The Solar System's bodies: sizes, spin, and how each is drawn.
 *
 * Radii: NASA Planetary Fact Sheets (https://nssdc.gsfc.nasa.gov/planetary/factsheet/), equatorial
 * and polar, km. Spin: IAU WGCCRE 2015 report (Archinal et al. 2018), as packaged in NAIF's
 * pck00011.tpc; Earth and Moon from the 2009 report. Pole right ascension and declination
 * (ICRF, degrees) as `value + rate·T` (T in Julian centuries), prime meridian W as
 * `value + rate·d` (d in days), all from J2000.0.
 */

export type SolarBodyId = 'sun' | PlanetId | 'moon';

export interface Spin {
  ra: readonly [number, number];
  dec: readonly [number, number];
  w: readonly [number, number];
}

/** How a body's surface is drawn (see solar-system.frag). */
export type Surface =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'moon'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

export interface SolarBody {
  id: SolarBodyId;
  /** Label on screen. */
  name: string;
  /** Equatorial and polar radius, km. */
  radiusKm: number;
  polarKm: number;
  spin: Spin;
  surface: Surface;
  /** Index into the shader's body arrays and its surface switch. */
  index: number;
}

const b = (
  id: SolarBodyId,
  name: string,
  radiusKm: number,
  polarKm: number,
  spin: Spin,
  index: number,
): SolarBody => ({ id, name, radiusKm, polarKm, spin, surface: id, index });

export const SOLAR_BODIES: readonly SolarBody[] = [
  b('sun', 'SUN', 695700, 695700, { ra: [286.13, 0], dec: [63.87, 0], w: [84.176, 14.1844] }, 0),
  b(
    'mercury',
    'MERCURY',
    2440.5,
    2438.3,
    { ra: [281.0103, -0.0328], dec: [61.4155, -0.0049], w: [329.5988, 6.1385108] },
    1,
  ),
  b(
    'venus',
    'VENUS',
    6051.8,
    6051.8,
    { ra: [272.76, 0], dec: [67.16, 0], w: [160.2, -1.4813688] },
    2,
  ),
  b(
    'earth',
    'EARTH',
    6378.1,
    6356.8,
    { ra: [0, -0.641], dec: [90, -0.557], w: [190.147, 360.9856235] },
    3,
  ),
  b(
    'moon',
    'MOON',
    1738.1,
    1736.0,
    { ra: [269.9949, 0.0031], dec: [66.5392, 0.013], w: [38.3213, 13.17635815] },
    4,
  ),
  b(
    'mars',
    'MARS',
    3396.2,
    3376.2,
    {
      ra: [317.269202, -0.10927547],
      dec: [54.432516, -0.05827105],
      w: [176.049863, 350.891982443297],
    },
    5,
  ),
  b(
    'jupiter',
    'JUPITER',
    71492,
    66854,
    { ra: [268.056595, -0.006499], dec: [64.495303, 0.002413], w: [284.95, 870.536] },
    6,
  ),
  b(
    'saturn',
    'SATURN',
    60268,
    54364,
    { ra: [40.589, -0.036], dec: [83.537, -0.004], w: [38.9, 810.7939024] },
    7,
  ),
  b(
    'uranus',
    'URANUS',
    25559,
    24973,
    { ra: [257.311, 0], dec: [-15.175, 0], w: [203.81, -501.1600928] },
    8,
  ),
  b(
    'neptune',
    'NEPTUNE',
    24764,
    24341,
    { ra: [299.36, 0], dec: [43.46, 0], w: [249.978, 541.1397757] },
    9,
  ),
];

export const BODY_COUNT = SOLAR_BODIES.length;

const byId = new Map(SOLAR_BODIES.map((s) => [s.id, s]));
export const solarBody = (id: SolarBodyId): SolarBody => byId.get(id)!;
export const findSolarBody = (id: string): SolarBody | undefined => byId.get(id as SolarBodyId);

export const AU_KM = 149597870.7;

/**
 * Saturn's main rings, radii in km from Saturn's centre (NASA Saturnian Rings Fact Sheet,
 * https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html), with typical normal optical
 * depths (Cuzzi et al. 2010, "An evolving view of Saturn's dynamic rings", Science 327, 1470).
 */
export const SATURN_RINGS: ReadonlyArray<{
  name: string;
  inner: number;
  outer: number;
  tau: number;
}> = [
  { name: 'D', inner: 66900, outer: 74510, tau: 0.001 },
  { name: 'C', inner: 74658, outer: 92000, tau: 0.1 },
  { name: 'B', inner: 92000, outer: 117580, tau: 2.0 },
  { name: 'Cassini Division', inner: 117580, outer: 122170, tau: 0.1 },
  { name: 'A', inner: 122170, outer: 133580, tau: 0.5 },
  { name: 'Encke Gap', inner: 133410, outer: 133735, tau: 0 },
  { name: 'F', inner: 140180, outer: 140270, tau: 0.5 },
];
