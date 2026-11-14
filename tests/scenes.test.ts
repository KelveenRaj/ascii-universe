import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController } from '@/engine/camera/CameraController';
import { DEFAULT_SCENE_ID, SCENES } from '@/scenes/registry';

const TAN_HALF_FOV = Math.tan((50 * Math.PI) / 360);

describe('scene registry', () => {
  it('has the default scene', () => {
    expect(SCENES[DEFAULT_SCENE_ID]).toBeDefined();
  });

  for (const [key, scene] of Object.entries(SCENES)) {
    describe(scene.id, () => {
      it('is registered under its own id', () => {
        expect(key).toBe(scene.id);
      });

      it('has 1–9 presets with unique ids and labels (they map to the 1–9 keys)', () => {
        const { presets } = scene.camera;
        expect(presets.length).toBeGreaterThan(0);
        expect(presets.length).toBeLessThanOrEqual(9);
        expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
        for (const p of presets) expect(p.label.length).toBeGreaterThan(0);
      });

      it('keeps every preset inside its camera limits', () => {
        const { presets, limits } = scene.camera;
        expect(limits.minDistance).toBeGreaterThan(0);
        expect(limits.maxDistance).toBeGreaterThan(limits.minDistance);
        for (const p of presets) {
          expect(p.distance).toBeGreaterThanOrEqual(limits.minDistance);
          expect(p.distance).toBeLessThanOrEqual(limits.maxDistance);
          expect(Math.abs(p.elevation * (Math.PI / 180))).toBeLessThanOrEqual(limits.maxElevation);
        }
      });
    });
  }
});

describe('CameraController with a scene setup', () => {
  const setup = SCENES[DEFAULT_SCENE_ID].camera;

  it('starts at, and resets to, the first preset', () => {
    const c = new CameraController(TAN_HALF_FOV, setup);
    expect(c.current.distance).toBe(setup.presets[0].distance);
    c.zoom(0.5);
    c.reset();
    expect(c.goal.distance).toBe(setup.presets[0].distance);
  });

  it('ignores unknown preset ids', () => {
    const c = new CameraController(TAN_HALF_FOV, setup);
    const before = c.position(new THREE.Vector3());
    c.setPreset('no-such-view', true);
    expect(c.position(new THREE.Vector3()).distanceTo(before)).toBe(0);
    expect(c.hasPreset('no-such-view')).toBe(false);
    expect(c.hasPreset(setup.presets[0].id)).toBe(true);
  });

  it('refuses a setup without presets', () => {
    expect(() => new CameraController(TAN_HALF_FOV, { ...setup, presets: [] })).toThrow();
  });
});
