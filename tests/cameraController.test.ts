import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_LIMITS, CameraController, VIEW_PRESETS } from '@/renderer/camera/CameraController';

const TAN_HALF_FOV = Math.tan((50 * Math.PI) / 360);
const DEG = Math.PI / 180;
const make = () => new CameraController(TAN_HALF_FOV);

function settle(c: CameraController, seconds = 5, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) c.update(dt);
}

describe('CameraController', () => {
  it('starts at the Interstellar preset: ~80° inclination, looking at the hole', () => {
    const c = make();
    const pos = c.position(new THREE.Vector3());
    expect(pos.length()).toBeCloseTo(VIEW_PRESETS.interstellar.distance, 6);
    expect(pos.y / pos.length()).toBeCloseTo(Math.sin(10 * DEG), 6);

    const cam = new THREE.PerspectiveCamera();
    c.apply(cam);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const toHole = pos.clone().negate().normalize();
    expect(forward.dot(toHole)).toBeCloseTo(1, 6);
  });

  it('eases toward the goal and converges', () => {
    const c = make();
    c.orbit(1, 0.3);
    c.zoom(0.5);
    expect(c.current.yaw).toBe(0); // nothing moves until update()
    settle(c);
    expect(c.current.yaw).toBeCloseTo(c.goal.yaw, 6);
    expect(c.current.elevation).toBeCloseTo(c.goal.elevation, 6);
    expect(c.current.distance).toBeCloseTo(c.goal.distance, 6);
  });

  it('smoothing is frame-rate independent', () => {
    const a = make();
    const b = make();
    a.orbit(1, 0);
    b.orbit(1, 0);
    a.update(0.1);
    for (let i = 0; i < 10; i++) b.update(0.01);
    expect(a.current.yaw).toBeCloseTo(b.current.yaw, 10);
  });

  it('clamps distance and elevation', () => {
    const c = make();
    c.zoom(1e-6);
    expect(c.goal.distance).toBe(CAMERA_LIMITS.minDistance);
    c.zoom(1e9);
    expect(c.goal.distance).toBe(CAMERA_LIMITS.maxDistance);
    c.orbit(0, 10);
    expect(c.goal.elevation).toBe(CAMERA_LIMITS.maxElevation);
    c.orbit(0, -20);
    expect(c.goal.elevation).toBe(-CAMERA_LIMITS.maxElevation);
  });

  it('can look straight down without flipping (no pole lock)', () => {
    const c = make();
    c.setPreset('topDown', true);
    const cam = new THREE.PerspectiveCamera();
    c.apply(cam);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(forward.y).toBeCloseTo(-1, 6);
    expect(Number.isFinite(cam.matrixWorld.elements[0])).toBe(true);
  });

  it('pans in the camera plane, perpendicular to the view direction', () => {
    const c = make();
    const cam = new THREE.PerspectiveCamera();
    c.apply(cam);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    c.pan(0.1, -0.05);
    expect(c.goal.target.length()).toBeGreaterThan(0);
    expect(c.goal.target.dot(forward)).toBeCloseTo(0, 6);
    // dragging right moves the scene right, i.e. the target to the camera's left
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    expect(c.goal.target.dot(right)).toBeLessThan(0);
  });

  it('keeps the pan target near the hole', () => {
    const c = make();
    for (let i = 0; i < 100; i++) c.pan(1, 0);
    expect(c.goal.target.length()).toBeCloseTo(CAMERA_LIMITS.maxTargetRadius, 6);
  });

  it('roll turns the view around its axis without moving the camera', () => {
    const c = make();
    const before = c.position(new THREE.Vector3());
    c.rollBy(Math.PI / 2);
    c.snap();
    expect(c.position(new THREE.Vector3()).distanceTo(before)).toBeCloseTo(0, 6);
    const cam = new THREE.PerspectiveCamera();
    c.apply(cam);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    expect(Math.abs(up.y)).toBeLessThan(0.2); // camera up is now roughly horizontal
  });

  it('screen drags follow the pointer when rolled 90°', () => {
    const c = make();
    c.rollBy(Math.PI / 2);
    c.snap();
    const yaw0 = c.goal.yaw;
    const elev0 = c.goal.elevation;
    c.orbitScreen(0, 0.1); // drag down on a rolled view behaves like an unrolled drag right
    expect(c.goal.yaw).toBeCloseTo(yaw0 - 0.1, 6);
    expect(c.goal.elevation).toBeCloseTo(elev0, 6);
  });

  it('presets take the short way round and level the horizon', () => {
    const c = make();
    c.orbit(4 * Math.PI + 0.2, 0);
    c.rollBy(2 * Math.PI + 0.3);
    c.snap();
    c.setPreset('eht');
    expect(Math.abs(c.goal.yaw - c.current.yaw)).toBeLessThanOrEqual(Math.PI);
    expect(Math.abs(c.goal.roll - c.current.roll)).toBeLessThanOrEqual(Math.PI);
    expect(Math.sin(c.goal.roll)).toBeCloseTo(0, 6);
    expect(c.goal.elevation).toBeCloseTo(73 * DEG, 6);
  });

  it('starts the attract-mode orbit only after the idle delay, and stops on input', () => {
    const c = make();
    c.attractDelay = 2;
    settle(c, 1.9);
    expect(c.attractActive).toBe(false);
    settle(c, 0.5);
    expect(c.attractActive).toBe(true);
    const yaw = c.goal.yaw;
    settle(c, 1);
    expect(c.goal.yaw).toBeGreaterThan(yaw);
    c.notifyInput();
    expect(c.attractActive).toBe(false);
    c.attractEnabled = false;
    settle(c, 5);
    expect(c.attractActive).toBe(false);
  });
});
