import type { Material, Sky } from '@/engine/display/palette/palettes';

/**
 * The black hole's colours. EHT images are false-colour maps of brightness temperature, not true
 * colour; these stops approximate the published Sgr A* / M87* images (an afmhot-like black → red →
 * orange → amber → pale yellow ramp).
 *
 * Order matters: a material's index here is the value blackhole.frag writes into the B channel.
 */
export const BLACK_HOLE_MATERIALS = [
  {
    id: 'eht-disk',
    label: 'EHT Sgr A*',
    ramp: {
      stops: [
        [0.0, '#000000'],
        [0.08, '#1A0602'],
        [0.18, '#4A0D02'],
        [0.32, '#8C1D04'],
        [0.46, '#C23B0A'],
        [0.6, '#E8660F'],
        [0.72, '#F7931E'],
        [0.84, '#FFC04D'],
        [0.93, '#FFE49A'],
        [1.0, '#FFF7E0'],
      ],
      interpolation: 'linear',
    },
  },
] as const satisfies readonly Material[];

export const BLACK_HOLE_SKY: Sky = { starTint: '#9AA3B8', background: '#050302' };
