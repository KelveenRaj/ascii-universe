import * as THREE from 'three';
import blackholeFrag from '../../shaders/blackhole.frag';
import type { Settings } from '../../state/settings';
import { FullscreenPass } from '../FullscreenPass';

type U<T> = THREE.IUniform<T>;

/** Pass 1: ray-marches the black hole into a small half-float target (see blackhole.frag). */
export class ScenePass {
  readonly target: THREE.WebGLRenderTarget;
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
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, // lets one tap average 2×2 texels when supersampling
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
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

  get tanHalfFov(): number {
    return this.pass.uniforms.uTanHalfFov.value;
  }

  /**
   * @param aspect   width / height of the image the rays span
   * @param starRows rows the vertical field of view is split into, for sizing stars
   */
  setSize(width: number, height: number, aspect: number, starRows: number): void {
    this.target.setSize(width, height);
    const u = this.pass.uniforms;
    u.uAspect.value = aspect;
    u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / starRows;
  }

  render(
    renderer: THREE.WebGLRenderer,
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
    this.pass.render(renderer, this.target);
  }

  dispose(): void {
    this.pass.dispose();
    this.target.dispose();
  }
}
