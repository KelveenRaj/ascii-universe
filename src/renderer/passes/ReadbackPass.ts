import * as THREE from 'three';
import readbackFrag from '@/shaders/readback.frag';
import { FullscreenPass } from '@/renderer/FullscreenPass';
import type { GlyphAtlas } from '@/renderer/glyphs/GlyphAtlas';
import { glyphIndicesToText } from '@/renderer/textExport';

type U<T> = THREE.IUniform<T>;

/**
 * On-demand (never per frame): renders glyph indices into a tiny cols×rows RGBA8 target, reads it
 * back and maps the indices to characters.
 */
export class ReadbackPass {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  private readonly pass: FullscreenPass<{
    uScene: U<THREE.Texture>;
    uGrid: U<THREE.Vector2>;
    uExposure: U<number>;
    uRampLength: U<number>;
    uStarBase: U<number>;
    uStarLength: U<number>;
  }>;

  constructor(scene: THREE.Texture) {
    this.pass = new FullscreenPass(readbackFrag, {
      uScene: { value: scene },
      uGrid: { value: new THREE.Vector2(1, 1) },
      uExposure: { value: 1 },
      uRampLength: { value: 1 },
      uStarBase: { value: 1 },
      uStarLength: { value: 1 },
    });
  }

  read(
    renderer: THREE.WebGLRenderer,
    cols: number,
    rows: number,
    atlas: GlyphAtlas,
    exposure: number,
  ): string {
    this.target.setSize(cols, rows);
    const u = this.pass.uniforms;
    u.uGrid.value.set(cols, rows);
    u.uExposure.value = exposure;
    u.uRampLength.value = atlas.rampLength;
    u.uStarBase.value = atlas.starBase;
    u.uStarLength.value = atlas.starLength;
    this.pass.render(renderer, this.target);

    const pixels = new Uint8Array(cols * rows * 4);
    renderer.readRenderTargetPixels(this.target, 0, 0, cols, rows, pixels);
    renderer.setRenderTarget(null);
    return glyphIndicesToText(pixels, cols, rows, atlas.glyphs);
  }

  dispose(): void {
    this.target.dispose();
    this.pass.dispose();
  }
}
