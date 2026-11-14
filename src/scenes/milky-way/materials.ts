import type { Material, Sky } from '@/engine/display/palette/palettes';

/**
 * The galaxy's colours, roughly as other spiral galaxies look in photos: a yellowish core of old
 * stars, blue-white arms of young ones, and pink clouds of glowing hydrogen (HII regions).
 *
 * Order matters: a material's index here is the value galaxy.frag writes into the B channel.
 */
export const MILKY_WAY_MATERIALS = [
  {
    id: 'old-stars',
    label: 'Old stars',
    ramp: {
      stops: [
        [0.0, '#000000'],
        [0.12, '#1C1006'],
        [0.3, '#5A3A16'],
        [0.5, '#A8743A'],
        [0.7, '#E2B46E'],
        [0.86, '#FFE3AE'],
        [1.0, '#FFF8EA'],
      ],
      interpolation: 'linear',
    },
  },
  {
    id: 'young-stars',
    label: 'Young stars',
    ramp: {
      stops: [
        [0.0, '#000000'],
        [0.12, '#070D22'],
        [0.3, '#1B3266'],
        [0.5, '#3F6DB8'],
        [0.7, '#86AEEA'],
        [0.86, '#C9DCFF'],
        [1.0, '#F2F7FF'],
      ],
      interpolation: 'linear',
    },
  },
  {
    id: 'hii-gas',
    label: 'Glowing gas',
    ramp: {
      stops: [
        [0.0, '#000000'],
        [0.15, '#22050F'],
        [0.35, '#6E1532'],
        [0.55, '#C23A66'],
        [0.75, '#F27BA0'],
        [1.0, '#FFE0EA'],
      ],
      interpolation: 'linear',
    },
  },
] as const satisfies readonly Material[];

export const MILKY_WAY_SKY: Sky = { starTint: '#A9B2C8', background: '#020205' };
