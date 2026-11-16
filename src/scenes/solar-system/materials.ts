import type { Material, Sky } from '@/engine/display/palette/palettes';

const ramp = (stops: Array<[number, string]>): Material['ramp'] => ({
  stops,
  interpolation: 'linear',
});

/** A ramp from black through a body's measured colour to near white. */
const tone = (dark: string, mid: string, light: string, top = '#FFFFFF'): Material['ramp'] =>
  ramp([
    [0, '#000000'],
    [0.18, dark],
    [0.5, mid],
    [0.82, light],
    [1, top],
  ]);

/**
 * Each surface class gets the colour it really has, from true-colour spacecraft imagery (the same
 * maps the classes come from: Blue Marble, LROC, Viking, MESSENGER, Cassini; Voyager 2 for Uranus
 * and Neptune). Order matters: index i is what solar-system.frag writes into B (the M_* constants
 * there).
 */
export const SOLAR_SYSTEM_MATERIALS = [
  // 0: the photosphere, about 5770 K: white with a faint warm cast
  {
    id: 'sun',
    label: 'Sun',
    ramp: tone('#3A1E06', '#C8782A', '#FFE0A8', '#FFFDF4'),
  },
  // 1: the corona's white light (scattered photospheric light)
  { id: 'corona', label: 'Corona', ramp: tone('#141210', '#6E665A', '#D8D0C0') },
  // 2–8: Earth
  { id: 'earth-ocean', label: 'Ocean', ramp: tone('#020A1C', '#123E78', '#4A86C0', '#D6ECFF') },
  { id: 'earth-forest', label: 'Forest', ramp: tone('#061006', '#24461C', '#5E7E40') },
  { id: 'earth-grass', label: 'Grass and scrub', ramp: tone('#121006', '#5A5A2A', '#A49A64') },
  { id: 'earth-desert', label: 'Desert', ramp: tone('#1E1206', '#8A6A3E', '#D8BC8A') },
  { id: 'earth-ice', label: 'Ice and snow', ramp: tone('#141A22', '#7C8CA0', '#DCE6F0') },
  { id: 'earth-cloud', label: 'Clouds', ramp: tone('#141618', '#80868E', '#E8ECF0') },
  { id: 'earth-lights', label: 'City lights', ramp: tone('#1C1004', '#A86A1C', '#FFD27A') },
  // 9: thin atmospheres seen edge-on (Rayleigh blue for Earth)
  { id: 'air', label: 'Atmosphere', ramp: tone('#040A1C', '#2A5AB4', '#9CC4FF') },
  // 10–11: the Moon
  { id: 'moon-highland', label: 'Lunar highlands', ramp: tone('#141210', '#6E6A64', '#C8C4BC') },
  { id: 'moon-maria', label: 'Lunar maria', ramp: tone('#0C0C0C', '#4A4846', '#96928C') },
  // 12–14: Mars
  { id: 'mars-dust', label: 'Martian dust', ramp: tone('#200C04', '#9A4E26', '#E0A070') },
  { id: 'mars-dark', label: 'Martian basalt', ramp: tone('#140806', '#5A3424', '#9A6A50') },
  { id: 'mars-ice', label: 'Polar ice', ramp: tone('#1A1614', '#A49488', '#F0E8E0') },
  // 15: Mercury, grey with a slight brown
  { id: 'mercury', label: 'Mercury', ramp: tone('#121010', '#6A625A', '#BEB6AC') },
  // 16: Venus' cloud tops, pale yellow-white
  { id: 'venus', label: 'Venus', ramp: tone('#1E1A0C', '#A89670', '#EEE2C0') },
  // 17–20: Jupiter
  { id: 'jupiter-zone', label: 'Jovian zones', ramp: tone('#1A1814', '#9A9284', '#ECE6D8') },
  { id: 'jupiter-belt', label: 'Jovian belts', ramp: tone('#1C0E06', '#8A5E3A', '#D2A880') },
  { id: 'jupiter-red', label: 'Great Red Spot', ramp: tone('#200A04', '#A04A24', '#E89A6A') },
  { id: 'jupiter-polar', label: 'Jovian polar haze', ramp: tone('#101214', '#5E6466', '#AEB6B6') },
  // 21–23: Saturn
  { id: 'saturn-light', label: 'Saturn bands', ramp: tone('#1C160A', '#A08C60', '#EADCB0') },
  { id: 'saturn-dark', label: 'Saturn belts', ramp: tone('#160E06', '#7E6A48', '#C8B088') },
  { id: 'saturn-ring', label: "Saturn's rings", ramp: tone('#16140E', '#8C8068', '#E6DCC4') },
  // 24–25: the ice giants (Voyager 2 true colour)
  { id: 'uranus', label: 'Uranus', ramp: tone('#061418', '#4E9AA8', '#B4E4E8') },
  { id: 'neptune', label: 'Neptune', ramp: tone('#040A1E', '#2E5AB0', '#8CB0EC') },
] as const satisfies readonly Material[];

export const SOLAR_SYSTEM_SKY: Sky = { starTint: '#A9B2C8', background: '#010103' };
