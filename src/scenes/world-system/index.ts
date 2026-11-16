import type { CameraSetup } from '@/engine/camera/CameraController';
import type { SceneModule } from '@/engine/scene/SceneModule';
import { SHIP_MATERIALS } from '@/world/ship/colors';
import { WORLD_SYSTEM_MATERIALS, WORLD_SYSTEM_SKY } from '@/scenes/world-system/materials';
import { WORLD_SYSTEM_PARAMS } from '@/scenes/world-system/params';
import { WorldSystemPass } from '@/scenes/world-system/WorldSystemPass';

/** Never used (your ship's chase camera is), but every scene has a setup. */
const CAMERA = {
  presets: [{ id: 'overview', label: 'OVERVIEW', elevation: 20, yaw: 0, distance: 20 }],
  limits: { minDistance: 1, maxDistance: 100, maxElevation: Math.PI / 2, maxTargetRadius: 50 },
} satisfies CameraSetup;

/**
 * The open world's star-system layer: the star you're visiting and its planets. Units: "su",
 * game AU (orbits compressed, sizes inflated; see src/world/gen/planets.ts).
 */
export const worldSystemScene: SceneModule<typeof WORLD_SYSTEM_PARAMS> = {
  id: 'world-system',
  title: 'Star system',
  camera: CAMERA,
  // the scene's own, then your ship's (ShipPass)
  materials: [...WORLD_SYSTEM_MATERIALS, ...SHIP_MATERIALS],
  sky: WORLD_SYSTEM_SKY,
  params: WORLD_SYSTEM_PARAMS,
  create: ({ tanHalfFov }) => new WorldSystemPass(tanHalfFov),
};
