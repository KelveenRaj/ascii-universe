import type { SceneModule } from '@/engine/scene/SceneModule';
import { MILKY_WAY_CAMERA } from '@/scenes/milky-way/camera';
import { GalaxyPass } from '@/scenes/milky-way/GalaxyPass';
import { MILKY_WAY_MATERIALS, MILKY_WAY_SKY } from '@/scenes/milky-way/materials';
import { MILKY_WAY_PARAMS } from '@/scenes/milky-way/params';

/**
 * The hub: our galaxy seen from outside, a barred spiral with Sgr A* at its centre and a marker
 * for the Sun. Units: thousands of light-years.
 */
export const milkyWayScene: SceneModule<typeof MILKY_WAY_PARAMS> = {
  id: 'milky-way',
  title: 'Milky Way',
  camera: MILKY_WAY_CAMERA,
  materials: MILKY_WAY_MATERIALS,
  sky: MILKY_WAY_SKY,
  params: MILKY_WAY_PARAMS,
  create: ({ tanHalfFov }) => new GalaxyPass(tanHalfFov),
};
