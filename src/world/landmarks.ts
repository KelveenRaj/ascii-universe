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

/** Half the width of the galaxy minimap (kly): the Sun's orbit with room to spare. */
export const MAP_GALAXY_EXTENT = 34;

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
  {
    id: 'sol',
    name: 'SOL',
    kind: 'G2 STAR, HOME',
    pos: SUN_POS,
    lum: 1,
    material: 0,
    bodyId: 'solar-system',
  },
];

export const findLandmark = (id: string): Landmark | undefined =>
  LANDMARKS.find((l) => l.id === id);
