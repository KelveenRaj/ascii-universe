import type { Body } from '@/content/schema';

/** The Milky Way. Checked against the sources below in November 2026. */
export const milkyWay: Body = {
  id: 'milky-way',
  name: 'Milky Way',
  kind: 'galaxy',
  sceneId: 'milky-way',
  tagline: 'Our home galaxy: a barred spiral about 100,000 light-years across.',
  summary: [
    'Every star you can see in the night sky belongs to it. We live in the disk, about halfway out, so we see it from the inside as a milky band of light across the sky.',
    'Nobody has a photo of it from outside. Its shape is pieced together from maps of young stars, glowing gas clouds and infrared starlight that gets through the dust, and it matches what we see in other spiral galaxies.',
    'At its centre sits Sagittarius A*, a black hole four million times the mass of the Sun. Click or tap its label to warp there.',
  ],
  facts: [
    {
      label: 'TYPE',
      value: 'BARRED SPIRAL',
      detail: 'A bar of stars through the middle, with arms winding out from its ends.',
      source: 'nasa-imagine',
    },
    {
      label: 'DIAMETER',
      value: '~100,000 LIGHT-YEARS',
      detail: 'Across the disk of stars.',
      source: 'nasa-imagine',
    },
    {
      label: 'STARS',
      value: '~100 BILLION',
      detail: 'A best estimate: counting them from inside the disk is hard.',
      source: 'nasa-imagine',
    },
    {
      label: 'ARMS',
      value: 'FOUR',
      detail: 'Traced by young, hot stars and clouds of ionised hydrogen.',
      source: 'nasa-imagine',
    },
    {
      label: 'BAR',
      value: '~27,000 LIGHT-YEARS',
      detail: 'Old, red stars, at about 45° to the line from the Sun to the centre.',
      source: 'uw-2005',
    },
    {
      label: 'SUN TO CENTRE',
      value: '27,000 LIGHT-YEARS',
      detail: 'Measured by the GRAVITY team; older overviews say about 25,000.',
      source: 'eso-2021',
    },
    {
      label: 'GALACTIC YEAR',
      value: '250 MILLION YEARS',
      detail: 'How long the Sun takes to go once around the centre.',
      source: 'nasa-imagine',
    },
    {
      label: 'ANDROMEDA',
      value: '2.5 MILLION LY AWAY',
      detail: 'The nearest big galaxy. Expected to collide with ours in about 4 billion years.',
      source: 'nasa-imagine',
    },
  ],
  sources: [
    {
      id: 'nasa-imagine',
      title: 'The Milky Way Galaxy',
      publisher: 'NASA Imagine the Universe',
      year: 2015,
      url: 'https://imagine.gsfc.nasa.gov/science/objects/milkyway1.html',
    },
    {
      id: 'uw-2005',
      title: 'Galactic survey reveals a new look for the Milky Way',
      publisher: 'University of Wisconsin–Madison (Spitzer GLIMPSE)',
      year: 2005,
      url: 'https://news.wisc.edu/galactic-survey-reveals-a-new-look-for-the-milky-way/',
    },
    {
      id: 'eso-2021',
      title:
        "Watch stars move around the Milky Way's supermassive black hole in deepest images yet",
      publisher: 'ESO (GRAVITY Collaboration)',
      year: 2021,
      url: 'https://www.eso.org/public/news/eso2119/',
    },
  ],
};
