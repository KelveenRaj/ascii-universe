import type { CameraSetup } from '@/engine/camera/CameraController';

/** Camera views for the galaxy. Units are thousands of light-years. */
export const MILKY_WAY_CAMERA = {
  presets: [
    { id: 'overview', label: 'OVERVIEW', elevation: 38, yaw: 20, distance: 115 },
    { id: 'faceOn', label: 'FACE-ON', elevation: 90, yaw: 0, distance: 120 },
    { id: 'edgeOn', label: 'EDGE-ON', elevation: 3, yaw: 0, distance: 105 },
  ],
  limits: {
    minDistance: 8,
    maxDistance: 300,
    maxElevation: Math.PI / 2,
    maxTargetRadius: 50,
  },
} satisfies CameraSetup;
