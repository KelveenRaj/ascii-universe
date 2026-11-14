import * as THREE from 'three';
import blurFrag from '@/shaders/blur.frag';
import { FullscreenPass } from '@/renderer/FullscreenPass';

type U<T> = THREE.IUniform<T>;

/** Distance between blur taps, in cells. 9 taps × 1.5 cells ≈ a 6-cell glow radius. */
const TAP_SPACING = 1.5;
const THRESHOLD = 0.45;

/**
 * Bloom on the low-res scene: bright-pass + horizontal blur, then vertical blur, both at one texel
 * per character cell. A few thousand texels, so it is essentially free.
 */
export class BloomPass {
  private readonly ping: THREE.WebGLRenderTarget;
  private readonly pong: THREE.WebGLRenderTarget;
  private readonly pass: FullscreenPass<{
    uInput: U<THREE.Texture | null>;
    uStep: U<THREE.Vector2>;
    uBrightPass: U<number>;
    uExposure: U<number>;
    uThreshold: U<number>;
  }>;
  private cols = 1;
  private rows = 1;

  constructor() {
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    };
    this.ping = new THREE.WebGLRenderTarget(1, 1, opts);
    this.pong = new THREE.WebGLRenderTarget(1, 1, opts);
    this.pass = new FullscreenPass(blurFrag, {
      uInput: { value: null },
      uStep: { value: new THREE.Vector2() },
      uBrightPass: { value: 1 },
      uExposure: { value: 1 },
      uThreshold: { value: THRESHOLD },
    });
  }

  /** The blurred result (valid after render()). */
  get texture(): THREE.Texture {
    return this.pong.texture;
  }

  setSize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.ping.setSize(cols, rows);
    this.pong.setSize(cols, rows);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Texture, exposure: number): void {
    const u = this.pass.uniforms;
    u.uExposure.value = exposure;

    u.uInput.value = scene;
    u.uBrightPass.value = 1;
    u.uStep.value.set(TAP_SPACING / this.cols, 0);
    this.pass.render(renderer, this.ping);

    u.uInput.value = this.ping.texture;
    u.uBrightPass.value = 0;
    u.uStep.value.set(0, TAP_SPACING / this.rows);
    this.pass.render(renderer, this.pong);
  }

  dispose(): void {
    this.pass.dispose();
    this.ping.dispose();
    this.pong.dispose();
  }
}
