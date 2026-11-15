import * as THREE from 'three';
import type { SceneLayout } from '@/engine/display/DisplayPipeline';
import { FullscreenPass } from '@/engine/FullscreenPass';
import type { SceneFrame, SceneInstance } from '@/engine/scene/SceneModule';
import { GALAXY } from '@/scenes/milky-way/layout';
import type { WorldGalaxyParams } from '@/scenes/world-galaxy/params';
import worldGalaxyFrag from '@/scenes/world-galaxy/shaders/world-galaxy.frag';

type U<T> = THREE.IUniform<T>;

/** Must match NEAR_MAX in world-galaxy.frag. */
export const NEAR_MAX = 48;

/**
 * Ray-marches the galaxy around the ship (see shaders/world-galaxy.frag). The camera is placed by
 * the open world's flight (WorldHost), in kly; the galaxy itself holds still.
 */
export class WorldGalaxyPass implements SceneInstance<WorldGalaxyParams> {
  private readonly pass: FullscreenPass<{
    uCamPos: U<THREE.Vector3>;
    uCamBasis: U<THREE.Matrix3>;
    uTanHalfFov: U<number>;
    uAspect: U<number>;
    uPixelAngle: U<number>;
    uMaxSteps: U<number>;
    uAngle: U<number>;
    uStarDensity: U<number>;
    uArmContrast: U<number>;
    uDust: U<number>;
    uGlow: U<number>;
    uContrast: U<number>;
    uRedshiftView: U<boolean>;
    uDiskRadius: U<number>;
    uBarHalfLength: U<number>;
    uBarAngle: U<number>;
    uPitch: U<number>;
    uNear: U<THREE.Vector4[]>;
    uNearInfo: U<THREE.Vector2[]>;
    uNearCount: U<number>;
    uStarGain: U<number>;
  }>;

  constructor(tanHalfFov: number) {
    this.pass = new FullscreenPass(worldGalaxyFrag, {
      uCamPos: { value: new THREE.Vector3() },
      uCamBasis: { value: new THREE.Matrix3() },
      uTanHalfFov: { value: tanHalfFov },
      uAspect: { value: 1 },
      uPixelAngle: { value: 0.002 },
      uMaxSteps: { value: 300 },
      uAngle: { value: 0 },
      uStarDensity: { value: 0.4 },
      uArmContrast: { value: 1 },
      uDust: { value: 1 },
      uGlow: { value: 0.35 },
      uContrast: { value: 1.6 },
      uRedshiftView: { value: false },
      uDiskRadius: { value: GALAXY.diskRadius },
      uBarHalfLength: { value: GALAXY.barHalfLength },
      uBarAngle: { value: GALAXY.barAngle },
      uPitch: { value: GALAXY.pitch },
      uNear: { value: Array.from({ length: NEAR_MAX }, () => new THREE.Vector4()) },
      uNearInfo: { value: Array.from({ length: NEAR_MAX }, () => new THREE.Vector2()) },
      uNearCount: { value: 0 },
      uStarGain: { value: 1 },
    });
  }

  setLayout({ aspect, starRows }: SceneLayout): void {
    const u = this.pass.uniforms;
    u.uAspect.value = aspect;
    u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / starRows;
  }

  render(frame: SceneFrame<WorldGalaxyParams>): void {
    const { renderer, target, camera, settings, params: p, steps, world } = frame;
    const u = this.pass.uniforms;
    u.uCamPos.value.copy(camera.position);
    u.uCamBasis.value.setFromMatrix4(camera.matrixWorld);
    u.uMaxSteps.value = steps;
    u.uStarDensity.value = p.starDensity;
    u.uArmContrast.value = p.armContrast;
    u.uDust.value = p.dust;
    u.uGlow.value = p.glow;
    u.uContrast.value = p.contrast;
    u.uRedshiftView.value = settings.debugView === 'redshift';
    u.uStarGain.value = p.nearStars;
    const stars = world?.stars ?? [];
    const n = Math.min(NEAR_MAX, stars.length);
    for (let i = 0; i < n; i++) {
      const s = stars[i];
      u.uNear.value[i].set(s.rel[0], s.rel[1], s.rel[2], s.brightness);
      u.uNearInfo.value[i].set(s.material, s.size);
    }
    u.uNearCount.value = n;
    this.pass.render(renderer, target);
  }

  /** The open world shows its own readout (WorldHost), so nothing here. */
  hudRows(): Array<[string, string]> {
    return [];
  }

  dispose(): void {
    this.pass.dispose();
  }
}
