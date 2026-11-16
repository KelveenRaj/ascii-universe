import type { CameraSetup } from '@/engine/camera/CameraController';
import type { SceneModule } from '@/engine/scene/SceneModule';
import { SOLAR_SYSTEM_MATERIALS, SOLAR_SYSTEM_SKY } from '@/scenes/solar-system/materials';
import { SOLAR_SYSTEM_PARAMS } from '@/scenes/solar-system/params';
import { SolarSystemPass } from '@/scenes/solar-system/SolarSystemPass';

/**
 * Units are au. The camera follows the body you've gone to (SolarSystemPass.focus), so the one
 * preset is the overview; zooming reaches from the whole system down to a few hundred km above a
 * surface.
 */
const CAMERA = {
  presets: [{ id: 'overview', label: 'OVERVIEW', elevation: 32, yaw: 25, distance: 9.5 }],
  limits: { minDistance: 1e-5, maxDistance: 160, maxElevation: Math.PI / 2, maxTargetRadius: 80 },
} satisfies CameraSetup;

/**
 * Our Solar System for a real date: the Sun, the eight planets and the Moon at their true sizes,
 * real positions (distances squeezed unless TRUE DISTANCES is on) and real spin axes, with
 * surfaces from spacecraft maps.
 */
export const solarSystemScene: SceneModule<typeof SOLAR_SYSTEM_PARAMS> = {
  id: 'solar-system',
  title: 'Solar System',
  camera: CAMERA,
  materials: SOLAR_SYSTEM_MATERIALS,
  sky: SOLAR_SYSTEM_SKY,
  params: SOLAR_SYSTEM_PARAMS,
  create: ({ tanHalfFov }) => new SolarSystemPass(tanHalfFov),
};
