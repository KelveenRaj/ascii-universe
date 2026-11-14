import * as THREE from 'three';
import presentFrag from '@/shaders/present.frag';
import { DEBUG_VIEWS, type DebugView } from '@/state/settings';
import { FullscreenPass } from '@/engine/FullscreenPass';
import type { PaletteColors } from '@/engine/display/passes/AsciiPass';

type U<T> = THREE.IUniform<T>;

/** Smooth (non-ASCII) display and the debug views (see present.frag). */
export class PresentPass {
  private readonly pass: FullscreenPass<{
    uScene: U<THREE.Texture>;
    uLut: U<THREE.Texture>;
    uStarTint: U<THREE.Vector3>;
    uBackground: U<THREE.Vector3>;
    uExposure: U<number>;
    uDebugView: U<number>;
  }>;

  constructor(scene: THREE.Texture, lut: THREE.Texture, colors: PaletteColors) {
    this.pass = new FullscreenPass(presentFrag, {
      uScene: { value: scene },
      uLut: { value: lut },
      uStarTint: { value: colors.starTint },
      uBackground: { value: colors.background },
      uExposure: { value: 1 },
      uDebugView: { value: 0 },
    });
  }

  render(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget | null,
    exposure: number,
    view: DebugView,
  ): void {
    const u = this.pass.uniforms;
    u.uExposure.value = exposure;
    u.uDebugView.value = DEBUG_VIEWS.indexOf(view);
    this.pass.render(renderer, target);
  }

  dispose(): void {
    this.pass.dispose();
  }
}
