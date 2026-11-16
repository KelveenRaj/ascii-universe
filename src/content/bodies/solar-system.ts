import type { Body, Fact, Source } from '@/content/schema';

/**
 * Our Solar System: the Sun, the eight planets and the Moon. Numbers from the NASA Planetary Fact
 * Sheets, checked in November 2026. Positions in the scene are computed for the date (see
 * src/scenes/solar-system/ephemeris.ts) and every surface comes from spacecraft maps
 * (public/maps/SOURCES.md).
 */

const factSheet = (name: string, file: string): Source => ({
  id: 'nssdc',
  title: `${name} Fact Sheet`,
  publisher: 'NASA Goddard Space Flight Center (NSSDCA)',
  year: 2024,
  url: `https://nssdc.gsfc.nasa.gov/planetary/factsheet/${file}`,
});

const fact = (label: string, value: string, detail?: string): Fact => ({
  label,
  value,
  ...(detail ? { detail } : {}),
  source: 'nssdc',
});

const MAPS =
  'The surface is a spacecraft map, wrapped on with the real tilt and spin for the date. Under natural colours each kind of terrain gets its own colour.';

export const solarSystem: Body = {
  id: 'solar-system',
  name: 'Solar System',
  kind: 'system',
  sceneId: 'solar-system',
  parent: 'milky-way',
  tagline: 'The Sun, its eight planets and our Moon, where they are today.',
  summary: [
    'Every planet sits where it really is on the date shown, worked out from orbital elements published by NASA JPL, and spins with the tilt and rate the IAU measures.',
    'Sizes are true to each other, the Sun included. Distances are not: real ones would leave the planets as invisible specks, so distances from the Sun are squeezed on a log scale (direction and order kept). Switch on TRUE SCALE in the settings to see the real spacing.',
    'Each planet is lit as a camera would expose for it, so it reads well; brightness between planets is not to scale.',
  ],
  facts: [
    {
      label: 'PLANETS',
      value: '8',
      detail: 'Since the IAU defined "planet" in 2006, which made Pluto a dwarf planet.',
      source: 'iau-2006',
    },
    {
      label: 'SUN',
      value: '99.86% OF THE MASS',
      detail: "Worked out from the fact sheets' masses: everything else adds up to 0.14%.",
      source: 'nssdc',
    },
    {
      label: 'ORBITS',
      value: 'JPL ELEMENTS',
      detail: 'Keplerian elements and rates, valid 1800–2050 to arcminutes.',
      source: 'jpl-approx',
    },
  ],
  sources: [
    {
      id: 'iau-2006',
      title: 'Resolution B5: Definition of a Planet in the Solar System',
      publisher: 'International Astronomical Union',
      year: 2006,
      url: 'https://www.iau.org/static/resolutions/Resolution_GA26-5-6.pdf',
    },
    { ...factSheet('Planetary', ''), url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' },
    {
      id: 'jpl-approx',
      title: 'Approximate Positions of the Planets',
      publisher: 'NASA JPL Solar System Dynamics (E. M. Standish)',
      year: 1992,
      url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    },
  ],
};

export const sun: Body = {
  id: 'sun',
  name: 'Sun',
  kind: 'star',
  sceneId: 'solar-system',
  parent: 'solar-system',
  tagline: 'An ordinary yellow dwarf star, and the reason anything else here is lit.',
  summary: [
    'A ball of hydrogen and helium so massive that its core fuses hydrogen into helium, at over fifteen million kelvin.',
    'The disk darkens towards its edge (limb darkening) because there you see higher, cooler gas; the faint glow beyond it is the corona, drawn with its measured fall-off.',
  ],
  facts: [
    fact('RADIUS', '695,700 KM', 'About 109 Earths across.'),
    fact('MASS', '333,000 EARTHS', '1.9884 × 10³⁰ kg.'),
    fact('SURFACE', '5,772 K', 'Effective temperature of the photosphere.'),
    fact('CORE', '15.7 MILLION K'),
    fact('POWER', '3.828 × 10²⁶ W', 'Its luminosity.'),
    fact('SPIN', '25 DAYS', 'At the equator; the poles turn slower.'),
  ],
  sources: [factSheet('Sun', 'sunfact.html')],
};

/** A planet's card from its fact-sheet numbers. */
function planet(p: {
  id: string;
  name: string;
  file: string;
  parent?: string;
  kind?: 'planet' | 'moon';
  tagline: string;
  summary: string[];
  facts: Fact[];
}): Body {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind ?? 'planet',
    sceneId: 'solar-system',
    parent: p.parent ?? 'solar-system',
    tagline: p.tagline,
    summary: p.summary,
    facts: p.facts,
    sources: [factSheet(p.name, p.file)],
  };
}

export const mercury = planet({
  id: 'mercury',
  name: 'Mercury',
  file: 'mercuryfact.html',
  tagline: 'The smallest planet, and the closest to the Sun.',
  summary: [
    'A cratered, airless world a little bigger than our Moon. Its day (sunrise to sunrise) lasts two of its years.',
    MAPS +
      " This one is MESSENGER's global mosaic; Mercury's true colour is a nearly uniform grey-brown.",
  ],
  facts: [
    fact('DIAMETER', '4,879 KM'),
    fact('FROM THE SUN', '57.9 MILLION KM', 'Average; its orbit is the most eccentric (0.206).'),
    fact('YEAR', '88 DAYS'),
    fact('DAY', '176 DAYS', 'Sunrise to sunrise (4,222.6 hours).'),
    fact('TEMPERATURE', '167 °C', 'Mean; from about −180 °C at night to 430 °C by day.'),
    fact('MOONS', '0'),
  ],
});

export const venus = planet({
  id: 'venus',
  name: 'Venus',
  file: 'venusfact.html',
  tagline: 'Earth-sized, wrapped in clouds of sulphuric acid, and the hottest planet.',
  summary: [
    'In visible light Venus is a featureless pale-yellow cloud deck, which is how it is drawn here. Underneath, the surface sits at 92 bar and 464 °C.',
    'It spins backwards, very slowly: a day there is longer than its year.',
  ],
  facts: [
    fact('DIAMETER', '12,104 KM'),
    fact('FROM THE SUN', '108.2 MILLION KM'),
    fact('YEAR', '224.7 DAYS'),
    fact('SPIN', '243 DAYS, BACKWARDS', 'Rotation period −5,832.5 hours.'),
    fact('TEMPERATURE', '464 °C', 'Mean, at the surface.'),
    fact('PRESSURE', '92 BAR', 'At the surface.'),
  ],
});

export const earth = planet({
  id: 'earth',
  name: 'Earth',
  file: 'earthfact.html',
  tagline: 'Home: the only world known to have oceans on its surface, and life.',
  summary: [
    "Seen here with NASA's Blue Marble map for its land and seas, a real cloud map, and the Black Marble map of city lights on the night side.",
    'The axis is tilted 23.4°, and the planet is turned to the right hour for the date, so the day side faces the Sun just as it does now.',
  ],
  facts: [
    fact('DIAMETER', '12,756 KM'),
    fact('FROM THE SUN', '149.6 MILLION KM', 'One astronomical unit.'),
    fact('YEAR', '365.2 DAYS'),
    fact('DAY', '24 HOURS', 'It turns once in 23.9 hours relative to the stars.'),
    fact('TILT', '23.4°'),
    fact('TEMPERATURE', '15 °C', 'Mean.'),
  ],
});

export const moon = planet({
  id: 'moon',
  name: 'Moon',
  file: 'moonfact.html',
  parent: 'earth',
  kind: 'moon',
  tagline: "Earth's only natural satellite, always showing us the same face.",
  summary: [
    "The dark patches are maria, old lava plains; the bright ground is older, cratered highland. The map is NASA's colour mosaic from the Lunar Reconnaissance Orbiter.",
    'It keeps its true distance from the Earth here, about 60 Earth radii.',
  ],
  facts: [
    fact('DIAMETER', '3,475 KM'),
    fact('FROM EARTH', '384,400 KM', 'Average.'),
    fact('ORBIT', '27.3 DAYS', 'And it turns once in the same time, so one side always faces us.'),
    fact('GRAVITY', '1.6 M/S²', "About a sixth of Earth's."),
    fact('TEMPERATURE', '−20 °C', 'Mean.'),
  ],
});

export const mars = planet({
  id: 'mars',
  name: 'Mars',
  file: 'marsfact.html',
  tagline: 'A cold desert world, red from iron-rich dust.',
  summary: [
    'The map is the USGS Viking colour mosaic: bright dusty plains, dark volcanic ground, the scar of Valles Marineris and the polar ice caps.',
    "Its axis is tilted 25.2°, close to Earth's, so it has seasons too.",
  ],
  facts: [
    fact('DIAMETER', '6,792 KM'),
    fact('FROM THE SUN', '228 MILLION KM'),
    fact('YEAR', '687 DAYS'),
    fact('DAY', '24.7 HOURS'),
    fact('TEMPERATURE', '−65 °C', 'Mean.'),
    fact('MOONS', '2', 'Phobos and Deimos.'),
  ],
});

export const jupiter = planet({
  id: 'jupiter',
  name: 'Jupiter',
  file: 'jupiterfact.html',
  tagline: 'The largest planet: more than twice the mass of all the others together.',
  summary: [
    'A giant of hydrogen and helium with no solid surface. The light zones and dark belts are cloud bands driven by fast winds; the Great Red Spot is a storm larger than the Earth.',
    "The map is Cassini's, from its December 2000 flyby. Jupiter's clouds keep moving, so details today differ.",
  ],
  facts: [
    fact('DIAMETER', '142,984 KM', 'At the equator; it spins so fast it bulges.'),
    fact('FROM THE SUN', '778.5 MILLION KM'),
    fact('YEAR', '11.9 YEARS', '4,331 days.'),
    fact('DAY', '9.9 HOURS'),
    fact('MASS', '318 EARTHS', '1,898 × 10²⁴ kg.'),
    fact('MOONS', '95'),
  ],
});

export const saturn = planet({
  id: 'saturn',
  name: 'Saturn',
  file: 'saturnfact.html',
  tagline: 'The ringed giant, light enough to float in water.',
  summary: [
    'The rings are drawn region by region at their measured radii (D, C, B, the Cassini Division, A with the Encke Gap, and F), each as dense as it really is.',
    'The cloud bands come from Cassini\'s "True Saturn" colour mosaic of 2004.',
  ],
  facts: [
    fact('DIAMETER', '120,536 KM', 'At the equator; it is the flattest planet.'),
    fact('FROM THE SUN', '1.43 BILLION KM'),
    fact('YEAR', '29.4 YEARS', '10,747 days.'),
    fact('DAY', '10.7 HOURS'),
    fact('DENSITY', '687 KG/M³', 'Less than water.'),
    fact('MOONS', '274'),
  ],
});

export const uranus = planet({
  id: 'uranus',
  name: 'Uranus',
  file: 'uranusfact.html',
  tagline: 'An ice giant knocked onto its side.',
  summary: [
    'Its axis is tilted 97.8°, so it rolls around the Sun, each pole getting 42 years of daylight then 42 of night.',
    'Seen up close it is a pale, almost featureless cyan, from methane in its atmosphere absorbing red light.',
  ],
  facts: [
    fact('DIAMETER', '51,118 KM'),
    fact('FROM THE SUN', '2.87 BILLION KM'),
    fact('YEAR', '84 YEARS', '30,589 days.'),
    fact('DAY', '17.2 HOURS', 'Backwards.'),
    fact('TILT', '97.8°'),
    fact('MOONS', '28'),
  ],
});

export const neptune = planet({
  id: 'neptune',
  name: 'Neptune',
  file: 'neptunefact.html',
  tagline: 'The farthest planet, a windy ice giant.',
  summary: [
    'Like Uranus, its colour comes from methane. Re-processed Voyager and Hubble data show it is only slightly bluer than Uranus, not the deep blue of old pictures.',
    'It has the fastest winds measured in the Solar System.',
  ],
  facts: [
    fact('DIAMETER', '49,528 KM'),
    fact('FROM THE SUN', '4.5 BILLION KM'),
    fact('YEAR', '164 YEARS', '59,800 days.'),
    fact('DAY', '16.1 HOURS'),
    fact('TEMPERATURE', '−200 °C', 'Mean.'),
    fact('MOONS', '16'),
  ],
});

export const SOLAR_SYSTEM_BODIES: readonly Body[] = [
  solarSystem,
  sun,
  mercury,
  venus,
  earth,
  moon,
  mars,
  jupiter,
  saturn,
  uranus,
  neptune,
];
