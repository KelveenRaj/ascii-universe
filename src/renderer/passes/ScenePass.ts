import * as THREE from 'three';
import blackholeFrag from '@/shaders/blackhole.frag';
import type { Settings } from '@/state/settings';
import type { SceneLayout } from '@/renderer/display/DisplayPipeline';
import { FullscreenPass } from '@/renderer/FullscreenPass';

type U<T> = THREE.IUniform<T>;

/** Pass 1: ray-marches the black hole into the display's scene buffer (see blackhole.frag). */
export class ScenePass {
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

  /** Called after the display re-lays out the scene buffer. */
  setLayout({ aspect, starRows }: SceneLayout): void {
    const u = this.pass.uniforms;
    u.uAspect.value = aspect;
    u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / starRows;
  }

  render(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    camera: THREE.PerspectiveCamera,
    s: Settings,
    time: number,
    steps: number,
  ): void {
    const u = this.pass.uniforms;
    u.uCamPos.value.copy(camera.position);
    u.uCamBasis.value.setFromMatrix4(camera.matrixWorld);
    u.uTime.value = time;
    u.uMaxSteps.value = steps;
    u.uDiskInner.value = s.diskInner;
    u.uDiskOuter.value = s.diskOuter;
    u.uBeaming.value = s.beaming;
    u.uStarDensity.value = s.starDensity;
    this.pass.render(renderer, target);
  }

  dispose(): void {
    this.pass.dispose();
  }
}
