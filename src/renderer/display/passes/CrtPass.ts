import * as THREE from 'three';
import crtFrag from '@/shaders/crt.frag';
import type { CrtStrengths } from '@/state/settings';
import { FullscreenPass } from '@/renderer/FullscreenPass';

type U<T> = THREE.IUniform<T>;

/**
 * Pass 4: CRT tube effects. The previous pass draws into `target` (full resolution, 8-bit), and
 * this pass resamples it to the screen. Skipped entirely when every effect is off.
 */
export class CrtPass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly pass: FullscreenPass<{
    uImage: U<THREE.Texture>;
    uResolution: U<THREE.Vector2>;
    uTime: U<number>;
    uGlyphPx: U<number>;
    uCurvature: U<number>;
    uChromatic: U<number>;
    uScanlines: U<number>;
    uMask: U<number>;
    uVignette: U<number>;
    uFlicker: U<number>;
  }>;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    this.pass = new FullscreenPass(crtFrag, {
      uImage: { value: this.target.texture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uGlyphPx: { value: 1 },
      uCurvature: { value: 0 },
      uChromatic: { value: 0 },
      uScanlines: { value: 0 },
      uMask: { value: 0 },
      uVignette: { value: 0 },
      uFlicker: { value: 0 },
    });
  }

  /** @param glyphPx device pixels per glyph pixel, so scanlines line up with glyph rows */
  setSize(width: number, height: number, glyphPx: number): void {
    this.target.setSize(width, height);
    this.pass.uniforms.uResolution.value.set(width, height);
    this.pass.uniforms.uGlyphPx.value = glyphPx;
  }

  render(renderer: THREE.WebGLRenderer, fx: CrtStrengths, time: number): void {
    const u = this.pass.uniforms;
    u.uTime.value = time;
    u.uCurvature.value = fx.curvature;
    u.uChromatic.value = fx.chromatic;
    u.uScanlines.value = fx.scanlines;
    u.uMask.value = fx.mask;
    u.uVignette.value = fx.vignette;
    u.uFlicker.value = fx.flicker;
    this.pass.render(renderer, null);
  }

  dispose(): void {
    this.pass.dispose();
    this.target.dispose();
  }
}
