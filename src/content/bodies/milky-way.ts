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
    'Nobody has a photo of it from outside. The map here is built from published models: the arms from radio-telescope distances to massive young stars, the bar, bulge and disks from infrared star counts that see through the dust. The far side, behind the centre, is the least certain part, so it is drawn dimmer.',
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
      value: 'FOUR, PLUS THE LOCAL ARM',
      detail:
        'Scutum-Centaurus, Sagittarius-Carina, Perseus and Norma-Outer, mapped by maser parallaxes. The Sun sits in the shorter Local (Orion) Arm.',
      source: 'reid-2019',
    },
    {
      label: 'ARM PITCH',
      value: '~10° ON AVERAGE',
      detail: 'How tightly the major arms wind; each arm bends ("kinks") once along its length.',
      source: 'reid-2019',
    },
    {
      label: 'BAR',
      value: '~33,000 LIGHT-YEARS',
      detail:
        'The long bar: 5.0 kpc from the centre to each end, at 28-33° to the line from the Sun.',
      source: 'bhg-2016',
    },
    {
      label: 'BULGE',
      value: 'BOXY, PEANUT-SHAPED',
      detail:
        'The puffed-up middle of the bar, an X shape seen side-on, at 27° to the Sun-centre line.',
      source: 'bhg-2016',
    },
    {
      label: 'THIN DISK',
      value: '~1,000 LY THICK',
      detail:
        'Scale height ~300 pc. Outwards its starlight halves about every 6,000 ly (from a 2.6 kpc scale length).',
      source: 'bhg-2016',
    },
    {
      label: 'THICK DISK',
      value: '~3,000 LY THICK',
      detail: 'Older stars, scale height 900 pc; about 4% of the stars near the Sun.',
      source: 'bhg-2016',
    },
    {
      label: 'DUST LAYER',
      value: '~440-610 LY THICK',
      detail:
        'Scale height 134 pc in the inner disk, flaring to 188 pc at the Sun. It hides the centre from optical telescopes.',
      source: 'drimmel-spergel-2001',
    },
    {
      label: 'CENTRAL ZONE',
      value: '~2,000 LY ACROSS',
      detail:
        'The central molecular zone: 20-60 million suns of dense gas within ~300 pc of the centre.',
      source: 'henshaw-2023',
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
      id: 'reid-2019',
      title:
        'Trigonometric Parallaxes of High-mass Star-forming Regions: Our View of the Milky Way',
      publisher: 'Reid et al., The Astrophysical Journal 885, 131',
      year: 2019,
      url: 'https://doi.org/10.3847/1538-4357/ab4a11',
    },
    {
      id: 'bhg-2016',
      title: 'The Galaxy in Context: Structural, Kinematic, and Integrated Properties',
      publisher: 'Bland-Hawthorn & Gerhard, Annual Review of Astronomy and Astrophysics 54, 529',
      year: 2016,
      url: 'https://doi.org/10.1146/annurev-astro-081915-023441',
    },
    {
      id: 'drimmel-spergel-2001',
      title:
        'Three-dimensional Structure of the Milky Way Disk: The Distribution of Stars and Dust beyond 0.35 R☉',
      publisher: 'Drimmel & Spergel, The Astrophysical Journal 556, 181',
      year: 2001,
      url: 'https://doi.org/10.1086/321556',
    },
    {
      id: 'henshaw-2023',
      title: 'Star Formation in the Central Molecular Zone of the Milky Way',
      publisher: 'Henshaw et al., Protostars and Planets VII (ASP Conference Series 534)',
      year: 2023,
      url: 'https://arxiv.org/abs/2203.11223',
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
