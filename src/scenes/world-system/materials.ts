import type { Material, Sky } from '@/engine/display/palette/palettes';

const ramp = (stops: Array<[number, string]>): Material['ramp'] => ({
  stops,
  interpolation: 'linear',
});

/**
 * A star system's colours: three star looks (hot blue-white, Sun-like gold, cool red) and the
 * planet kinds. Order matters: index i is what world-system.frag writes into B, and must match
 * SYSTEM_MATERIAL in src/world/gen/planets.ts.
 */
export const WORLD_SYSTEM_MATERIALS = [
  {
    id: 'star-hot',
    label: 'Hot star',
    ramp: ramp([
      [0, '#000000'],
      [0.15, '#0A1430'],
      [0.4, '#3A64B8'],
      [0.7, '#A8C6FF'],
      [1, '#F4F8FF'],
    ]),
  },
  {
    id: 'star-sun',
    label: 'Sun-like star',
    ramp: ramp([
      [0, '#000000'],
      [0.15, '#2A1404'],
      [0.4, '#A0581A'],
      [0.7, '#F2B24E'],
      [1, '#FFF6DC'],
    ]),
  },
  {
    id: 'star-red',
    label: 'Red star',
    ramp: ramp([
      [0, '#000000'],
      [0.15, '#2A0606'],
      [0.4, '#8E1E14'],
      [0.7, '#E2582E'],
      [1, '#FFD2B0'],
    ]),
  },
  {
    id: 'rock',
    label: 'Rocky planet',
    ramp: ramp([
      [0, '#000000'],
      [0.2, '#1A1816'],
      [0.5, '#6A635A'],
      [0.8, '#B4ACA0'],
      [1, '#ECE6DC'],
    ]),
  },
  {
    id: 'ocean',
    label: 'Ocean world',
    ramp: ramp([
      [0, '#000000'],
      [0.2, '#04162A'],
      [0.5, '#1E5E9A'],
      [0.8, '#6CB4D8'],
      [1, '#E6F6FF'],
    ]),
  },
  {
    id: 'desert',
    label: 'Desert planet',
    ramp: ramp([
      [0, '#000000'],
      [0.2, '#24160A'],
      [0.5, '#8E6430'],
      [0.8, '#DDB476'],
      [1, '#FFF0D0'],
    ]),
  },
  {
    id: 'gas',
    label: 'Gas giant',
    ramp: ramp([
      [0, '#000000'],
      [0.2, '#24140C'],
      [0.5, '#9A6A44'],
      [0.8, '#E2C29A'],
      [1, '#FFF4E4'],
    ]),
  },
  {
    id: 'ice',
    label: 'Ice giant',
    ramp: ramp([
      [0, '#000000'],
      [0.2, '#06202A'],
      [0.5, '#2E8A9E'],
      [0.8, '#8EDCE6'],
      [1, '#EEFFFF'],
    ]),
  },
  {
    id: 'lava',
    label: 'Lava world',
    ramp: ramp([
      [0, '#000000'],
      [0.2, '#2A0A04'],
      [0.5, '#A43414'],
      [0.8, '#F08A3A'],
      [1, '#FFE6B4'],
    ]),
  },
  {
    id: 'ring',
    label: 'Rings',
    ramp: ramp([
      [0, '#000000'],
      [0.25, '#1E1C18'],
      [0.6, '#8A8270'],
      [1, '#F0E8D4'],
    ]),
  },
] as const satisfies readonly Material[];

export const WORLD_SYSTEM_SKY: Sky = { starTint: '#A9B2C8', background: '#020205' };
