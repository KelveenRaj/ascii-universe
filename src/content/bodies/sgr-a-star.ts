import type { Body } from '@/content/schema';

/** Sagittarius A*. Checked against the sources below in November 2026. */
export const sgrAStar: Body = {
  id: 'sgr-a-star',
  name: 'Sagittarius A*',
  designation: 'SGR A*',
  kind: 'black-hole',
  sceneId: 'black-hole',
  tagline: 'The supermassive black hole at the centre of the Milky Way.',
  summary: [
    'About four million times the mass of the Sun, packed into a region smaller than the orbit of Mercury. We know it is there because stars close to it whip around something invisible, on orbits that only make sense if that something is a black hole.',
    'In 2022 the Event Horizon Telescope released the first image of it: a ring of glowing gas around a dark shadow, from data taken by a planet-sized network of radio dishes in 2017.',
    'This view is a simplified model: the hole does not spin and the disk is infinitely thin. Under natural colours the disk is coloured by brightness, like the EHT images, not by what your eye would see.',
  ],
  facts: [
    {
      label: 'MASS',
      value: '4.30 MILLION SUNS',
      detail: 'From the orbits of the stars S2, S29, S38 and S55.',
      source: 'eso-2021',
    },
    {
      label: 'DISTANCE',
      value: '27,000 LIGHT-YEARS',
      detail: 'Refined in the same study as the mass.',
      source: 'eso-2021',
    },
    {
      label: 'HORIZON',
      value: '12.7 MILLION KM',
      detail:
        'Radius, worked out from the mass (2GM/c², assuming no spin). It would fit well inside the orbit of Mercury.',
      source: 'eso-2021',
    },
    {
      label: 'FIRST IMAGE',
      value: '12 MAY 2022',
      detail: 'Event Horizon Telescope: eight telescopes, observing at 1.3 mm in 2017.',
      source: 'eht-2022',
    },
    {
      label: 'RING SIZE',
      value: '51.8 MICROARCSEC',
      detail: 'Diameter of the bright ring as seen from Earth (±2.3).',
      source: 'eht-2022',
    },
    {
      label: 'STAR S2',
      value: 'ORBIT 16 YEARS',
      detail: 'Comes within about 20 billion km of the black hole at its closest.',
      source: 'eso-2018',
    },
    {
      label: 'DISCOVERED',
      value: '1974',
      detail:
        'Bruce Balick and Robert Brown, as a compact radio source, with the Green Bank interferometer.',
      source: 'goss-2003',
    },
    {
      label: 'NOBEL PRIZE',
      value: '2020',
      detail:
        'Reinhard Genzel and Andrea Ghez, for finding the compact object at the galactic centre.',
      source: 'nobel-2020',
    },
  ],
  sources: [
    {
      id: 'eso-2021',
      title:
        "Watch stars move around the Milky Way's supermassive black hole in deepest images yet",
      publisher: 'ESO (GRAVITY Collaboration)',
      year: 2021,
      url: 'https://www.eso.org/public/news/eso2119/',
    },
    {
      id: 'eht-2022',
      title:
        'First Sagittarius A* Event Horizon Telescope Results. I. The Shadow of the Supermassive Black Hole in the Center of the Milky Way',
      publisher: 'EHT Collaboration, ApJL 930 L12',
      year: 2022,
      url: 'https://doi.org/10.3847/2041-8213/ac6674',
    },
    {
      id: 'eso-2018',
      title: "First Successful Test of Einstein's General Relativity Near Supermassive Black Hole",
      publisher: 'ESO',
      year: 2018,
      url: 'https://www.eso.org/public/news/eso1825/',
    },
    {
      id: 'goss-2003',
      title: 'The Discovery of Sgr A*',
      publisher: 'Goss, Brown & Lo, Astronomische Nachrichten',
      year: 2003,
      url: 'https://arxiv.org/abs/astro-ph/0305074',
    },
    {
      id: 'nobel-2020',
      title: 'The Nobel Prize in Physics 2020',
      publisher: 'NobelPrize.org',
      year: 2020,
      url: 'https://www.nobelprize.org/prizes/physics/2020/summary/',
    },
  ],
};
