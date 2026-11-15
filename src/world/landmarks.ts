import { GALAXY } from '@/scenes/milky-way/layout';
import { add, type Vec3d } from '@/world/math';

/**
 * Real places in the open world, among the procedural stars. Positions are in the galaxy frame
 * (kly, centre at the origin, Sun on +Z), placed from their galactic coordinates as seen from the
 * Sun: longitude l from the galactic centre (−Z) towards +X, latitude b towards +Y (north).
 * Distances are rounded published values; for the far supergiants they're uncertain by 10–20%.
 */
export interface Landmark {
  id: string;
  name: string;
  /** What it is, one line for the HUD. */
  kind: string;
  pos: Vec3d;
  /** How bright it looks, like StarSystem.lum (squashed for display). */
  lum: number;
  /** 0 gold, 1 blue, 2 red (galaxy layer materials). */
  material: number;
  /** A body in the content catalog you can visit for the full view and info card. */
  bodyId?: string;
}

export const SUN_POS: Vec3d = [0, 0, GALAXY.sunRadius];

const DEG = Math.PI / 180;

/** Galaxy-frame position of something at galactic longitude/latitude (degrees) and `ly` light-years from the Sun. */
export function fromSun(l: number, b: number, ly: number): Vec3d {
  const d = ly / 1000;
  const cb = Math.cos(b * DEG);
  return add(SUN_POS, [
    d * cb * Math.sin(l * DEG),
    d * Math.sin(b * DEG),
    -d * cb * Math.cos(l * DEG),
  ]);
}

export const LANDMARKS: readonly Landmark[] = [
  {
    id: 'sgr-a-star',
    name: 'SGR A*',
    kind: 'SUPERMASSIVE BLACK HOLE',
    pos: [0, 0, 0],
    lum: 400,
    material: 0,
    bodyId: 'sgr-a-star',
  },
  { id: 'sol', name: 'SOL', kind: 'G2 STAR, HOME', pos: SUN_POS, lum: 1, material: 0 },
  {
    id: 'sirius',
    name: 'SIRIUS',
    kind: 'A1 STAR, 8.6 LY',
    pos: fromSun(227.2, -8.9, 8.6),
    lum: 25,
    material: 1,
  },
  {
    id: 'vega',
    name: 'VEGA',
    kind: 'A0 STAR, 25 LY',
    pos: fromSun(67.4, 19.2, 25),
    lum: 40,
    material: 1,
  },
  {
    id: 'polaris',
    name: 'POLARIS',
    kind: 'F7 SUPERGIANT, 430 LY',
    pos: fromSun(123.3, 26.5, 430),
    lum: 1200,
    material: 0,
  },
  {
    id: 'betelgeuse',
    name: 'BETELGEUSE',
    kind: 'M1 SUPERGIANT, 550 LY',
    pos: fromSun(199.8, -9.0, 550),
    lum: 9000,
    material: 2,
  },
  {
    id: 'rigel',
    name: 'RIGEL',
    kind: 'B8 SUPERGIANT, 860 LY',
    pos: fromSun(209.2, -25.2, 860),
    lum: 9000,
    material: 1,
  },
  {
    id: 'deneb',
    name: 'DENEB',
    kind: 'A2 SUPERGIANT, 2,600 LY',
    pos: fromSun(84.3, 2.0, 2600),
    lum: 20000,
    material: 1,
  },
];

export const findLandmark = (id: string): Landmark | undefined =>
  LANDMARKS.find((l) => l.id === id);
