import * as THREE from 'three';
import type { SceneLayout } from '@/engine/display/DisplayPipeline';
import { FullscreenPass } from '@/engine/FullscreenPass';
import type { SceneFrame, SceneInstance } from '@/engine/scene/SceneModule';
import type { BlackHoleParams } from '@/scenes/black-hole/params';
import blackholeFrag from '@/scenes/black-hole/shaders/blackhole.frag';

type U<T> = THREE.IUniform<T>;

/**
 * Ray-marches the black hole into the display's scene buffer (see shaders/blackhole.frag), and
 * keeps the disk's animation clock.
 */
export class BlackHolePass implements SceneInstance<BlackHoleParams> {
  private readonly pass: FullscreenPass<{
    uCamPos: U<THREE.Vector3>;
    uCamBasis: U<THREE.Matrix3>;
    uTanHalfFov: U<number>;
    uAspect: U<number>;
    uPixelAngle: U<number>;
    uTime: U<number>;
    uMaxSteps: U<number>;
    uDiskInner: U<number>;
    uDiskOuter: U<number>;
    uBeaming: U<number>;
    uStarDensity: U<number>;
  }>;
  /** Disk animation time, in r_s/c units; advances at diskSpeed × real time unless paused. */
  private diskTime = 0;

  constructor(tanHalfFov: number) {
    this.pass = new FullscreenPass(blackholeFrag, {
      uCamPos: { value: new THREE.Vector3() },
      uCamBasis: { value: new THREE.Matrix3() },
      uTanHalfFov: { value: tanHalfFov },
      uAspect: { value: 1 },
      uPixelAngle: { value: 0.002 },
      uTime: { value: 0 },
      uMaxSteps: { value: 300 },
      uDiskInner: { value: 3 },
      uDiskOuter: { value: 12 },
      uBeaming: { value: 3 },
      uStarDensity: { value: 0.3 },
    });
  }

  setLayout({ aspect, starRows }: SceneLayout): void {
    const u = this.pass.uniforms;
    u.uAspect.value = aspect;
    u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / starRows;
  }

  render(frame: SceneFrame<BlackHoleParams>): void {
    const { renderer, target, camera, settings, params: p, dt, steps, frozenTime } = frame;
    if (!settings.paused) this.diskTime += dt * p.diskSpeed;
    const u = this.pass.uniforms;
    u.uCamPos.value.copy(camera.position);
    u.uCamBasis.value.setFromMatrix4(camera.matrixWorld);
    u.uTime.value = frozenTime ?? this.diskTime;
    u.uMaxSteps.value = steps;
    u.uDiskInner.value = p.diskInner;
    u.uDiskOuter.value = p.diskOuter;
    u.uBeaming.value = p.beaming;
    u.uStarDensity.value = p.starDensity;
    this.pass.render(renderer, target);
  }

  hudRows(camera: THREE.PerspectiveCamera): Array<[string, string]> {
    const pos = camera.position;
    const distance = pos.length();
    // inclination: angle between the view direction and the disk normal
    const inclination = (Math.acos(Math.abs(pos.y) / Math.max(distance, 1e-6)) * 180) / Math.PI;
    return [
      ['DIST', `${distance.toFixed(1)} Rs`],
      ['INCL', `${inclination.toFixed(0)}°`],
    ];
  }

  dispose(): void {
    this.pass.dispose();
  }
}
