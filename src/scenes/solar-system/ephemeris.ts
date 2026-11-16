/**
 * Where the planets and the Moon are on a given date.
 *
 * Planets: JPL's "Approximate Positions of the Planets" (E. M. Standish), Table 1: Keplerian
 * elements and their rates, J2000 ecliptic and equinox, valid 1800–2050 to within arcminutes.
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *
 * Moon: the low-precision lunar formulae of the Astronomical Almanac (about 0.3° in longitude,
 * 0.2° in latitude), geocentric, ecliptic of date (close enough to J2000 for this purpose).
 *
 * Everything here is heliocentric ecliptic J2000, in au: x towards the March equinox, z towards
 * ecliptic north. layout.ts turns that into scene coordinates.
 */

export type Vec3 = [number, number, number];

export type PlanetId =
  'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

/** a (au), e, I, L, long. perihelion, long. node (degrees): value and rate per Julian century. */
type Elements = readonly [number, number, number, number, number, number];

type Orbiter = Exclude<PlanetId, 'earth'> | 'emb';

const ELEMENTS: Record<Orbiter, { at: Elements; rate: Elements }> = {
  mercury: {
    at: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    at: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  },
  // the Earth–Moon barycentre; the Earth itself is found from it and the Moon
  emb: {
    at: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  },
  mars: {
    at: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    at: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    at: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
  uranus: {
    at: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  },
  neptune: {
    at: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  },
};

export const PLANET_IDS: readonly PlanetId[] = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

const DEG = Math.PI / 180;
/** Earth/Moon mass ratio (IAU 2009). */
const EARTH_MOON_MASS_RATIO = 81.30056;
/** Earth's equatorial radius in au, for the Moon's distance from its parallax. */
const EARTH_RADIUS_AU = 6378.137 / 149597870.7;

/** Julian date of a JS date (UTC; the ~69 s to TT doesn't matter at this accuracy). */
export const julianDate = (date: Date): number => date.getTime() / 86400000 + 2440587.5;

/** Days since J2000.0 (2000-01-01 12:00). */
export const daysSinceJ2000 = (date: Date): number => julianDate(date) - 2451545.0;

/** Julian centuries since J2000.0. */
export const centuriesSinceJ2000 = (date: Date): number => daysSinceJ2000(date) / 36525;

/** Solves Kepler's equation M = E − e sin E (radians). */
export function eccentricAnomaly(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 30; i++) {
    const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

function keplerPosition(id: Orbiter, T: number): Vec3 {
  const { at, rate } = ELEMENTS[id];
  const [a, e, I, L, peri, node] = at.map((v, i) => v + rate[i] * T);
  const omega = (peri - node) * DEG; // argument of perihelion
  let M = ((L - peri) % 360) * DEG;
  if (M > Math.PI) M -= 2 * Math.PI;
  if (M < -Math.PI) M += 2 * Math.PI;
  const E = eccentricAnomaly(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const cO = Math.cos(node * DEG);
  const sO = Math.sin(node * DEG);
  const cI = Math.cos(I * DEG);
  const sI = Math.sin(I * DEG);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

const sinD = (deg: number) => Math.sin(deg * DEG);
const cosD = (deg: number) => Math.cos(deg * DEG);

/** The Moon relative to the Earth, ecliptic, au (Astronomical Almanac low-precision formulae). */
export function moonGeocentric(T: number): Vec3 {
  const lon =
    218.32 +
    481267.881 * T +
    6.29 * sinD(135.0 + 477198.87 * T) -
    1.27 * sinD(259.3 - 413335.36 * T) +
    0.66 * sinD(235.7 + 890534.22 * T) +
    0.21 * sinD(269.9 + 954397.74 * T) -
    0.19 * sinD(357.5 + 35999.05 * T) -
    0.11 * sinD(186.5 + 966404.03 * T);
  const lat =
    5.13 * sinD(93.3 + 483202.02 * T) +
    0.28 * sinD(228.2 + 960400.89 * T) -
    0.28 * sinD(318.3 + 6003.15 * T) -
    0.17 * sinD(217.6 - 407332.21 * T);
  const parallax =
    0.9508 +
    0.0518 * cosD(134.9 + 477198.85 * T) +
    0.0095 * cosD(259.2 - 413335.38 * T) +
    0.0078 * cosD(235.7 + 890534.23 * T) +
    0.0028 * cosD(269.9 + 954397.7 * T);
  const r = EARTH_RADIUS_AU / sinD(parallax);
  return [r * cosD(lat) * cosD(lon), r * cosD(lat) * sinD(lon), r * sinD(lat)];
}

/**
 * One full orbit of a planet as `n` points (heliocentric ecliptic J2000, au), starting where it is
 * at `date`. The Earth's is the Earth–Moon barycentre's, which is within 5000 km of it.
 */
export function orbitPath(id: PlanetId, date: Date, n: number): Vec3[] {
  const orbiter: Orbiter = id === 'earth' ? 'emb' : id;
  const T = centuriesSinceJ2000(date);
  const period = 360 / ELEMENTS[orbiter].rate[3]; // centuries
  return Array.from({ length: n }, (_, k) => keplerPosition(orbiter, T + (period * k) / n));
}

export interface Positions {
  /** Heliocentric ecliptic J2000, au. */
  planets: Record<PlanetId, Vec3>;
  /** Moon relative to the Earth, au. */
  moon: Vec3;
}

/** Every planet (and the Moon) at `date`. */
export function positionsAt(date: Date): Positions {
  const T = centuriesSinceJ2000(date);
  const planets = {} as Record<PlanetId, Vec3>;
  for (const id of PLANET_IDS) if (id !== 'earth') planets[id] = keplerPosition(id, T);
  const moon = moonGeocentric(T);
  // the elements are for the Earth–Moon barycentre; the Earth sits a little off it
  const emb = keplerPosition('emb', T);
  const k = 1 / (1 + EARTH_MOON_MASS_RATIO);
  planets.earth = [emb[0] - moon[0] * k, emb[1] - moon[1] * k, emb[2] - moon[2] * k];
  return { planets, moon };
}
