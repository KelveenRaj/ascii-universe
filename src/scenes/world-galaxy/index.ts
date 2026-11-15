import type { CameraSetup } from '@/engine/camera/CameraController';
import type { SceneModule } from '@/engine/scene/SceneModule';
import { MILKY_WAY_MATERIALS, MILKY_WAY_SKY } from '@/scenes/milky-way/materials';
import { WORLD_GALAXY_PARAMS } from '@/scenes/world-galaxy/params';
import { WorldGalaxyPass } from '@/scenes/world-galaxy/WorldGalaxyPass';

/**
 * The orbit camera is never used here (your ship's chase camera is), but every scene has a setup:
 * this one frames the galaxy from outside, should the engine ever fall back to it.
 */
const CAMERA = {
  presets: [{ id: 'overview', label: 'OVERVIEW', elevation: 38, yaw: 20, distance: 115 }],
  limits: { minDistance: 8, maxDistance: 300, maxElevation: Math.PI / 2, maxTargetRadius: 50 },
} satisfies CameraSetup;

/**
 * The open world's galaxy layer: the Milky Way around your ship as you fly through it. Same look
 * and colours as the overview. Units: thousands of light-years.
 */
export const worldGalaxyScene: SceneModule<typeof WORLD_GALAXY_PARAMS> = {
  id: 'world-galaxy',
  title: 'Open space',
  camera: CAMERA,
  materials: MILKY_WAY_MATERIALS,
  sky: MILKY_WAY_SKY,
  params: WORLD_GALAXY_PARAMS,
  create: ({ tanHalfFov }) => new WorldGalaxyPass(tanHalfFov),
};
