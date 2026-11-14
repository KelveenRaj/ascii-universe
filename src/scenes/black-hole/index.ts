import type { SceneModule } from '@/engine/scene/SceneModule';
import { BlackHolePass } from '@/scenes/black-hole/BlackHolePass';
import { BLACK_HOLE_CAMERA } from '@/scenes/black-hole/camera';

/**
 * Sagittarius A*: a Schwarzschild black hole with a thin, Doppler-beamed accretion disk and a
 * lensed starfield. Units: Schwarzschild radii.
 */
export const blackHoleScene: SceneModule = {
  id: 'black-hole',
  title: 'Sagittarius A*',
  camera: BLACK_HOLE_CAMERA,
  create: ({ tanHalfFov }) => new BlackHolePass(tanHalfFov),
};
