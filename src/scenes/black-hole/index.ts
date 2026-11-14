import type { SceneModule } from '@/engine/scene/SceneModule';
import { BlackHolePass } from '@/scenes/black-hole/BlackHolePass';
import { BLACK_HOLE_CAMERA } from '@/scenes/black-hole/camera';
import { BLACK_HOLE_MATERIALS, BLACK_HOLE_SKY } from '@/scenes/black-hole/materials';
import { BLACK_HOLE_PARAMS } from '@/scenes/black-hole/params';

/**
 * Sagittarius A*: a Schwarzschild black hole with a thin, Doppler-beamed accretion disk and a
 * lensed starfield. Units: Schwarzschild radii.
 */
export const blackHoleScene: SceneModule<typeof BLACK_HOLE_PARAMS> = {
  id: 'black-hole',
  title: 'Sagittarius A*',
  camera: BLACK_HOLE_CAMERA,
  materials: BLACK_HOLE_MATERIALS,
  sky: BLACK_HOLE_SKY,
  params: BLACK_HOLE_PARAMS,
  create: ({ tanHalfFov }) => new BlackHolePass(tanHalfFov),
};
