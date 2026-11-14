import type { CameraSetup } from '@/engine/camera/CameraController';

/** Camera views for the black hole. Units are Schwarzschild radii (r_s = 1). */
export const BLACK_HOLE_CAMERA = {
  presets: [
    /** ~80° inclination: disk nearly edge-on, far side arcing over and under the shadow. */
    { id: 'interstellar', label: 'EDGE-ON', elevation: 10, yaw: 0, distance: 26 },
    /** ~17° inclination: M87*'s viewing angle, the EHT ring. */
    { id: 'eht', label: 'EHT', elevation: 73, yaw: 0, distance: 26 },
    { id: 'topDown', label: 'TOP', elevation: 90, yaw: 0, distance: 30 },
  ],
  limits: {
    /** Just outside the photon sphere (1.5) and the shader's camera-outside assumption. */
    minDistance: 2.6,
    maxDistance: 120,
    maxElevation: Math.PI / 2,
    maxTargetRadius: 30,
  },
} satisfies CameraSetup;
