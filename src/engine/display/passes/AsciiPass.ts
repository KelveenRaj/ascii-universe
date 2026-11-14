import * as THREE from 'three';
import asciiFrag from '@/shaders/ascii.frag';
import { FullscreenPass } from '@/engine/FullscreenPass';
import type { GlyphAtlas } from '@/engine/display/glyphs/GlyphAtlas';
import type { CharGrid } from '@/engine/display/grid';

type U<T> = THREE.IUniform<T>;

/** Palette colours shared by the ASCII and smooth passes. */
export interface PaletteColors {
  starTint: THREE.Vector3;
  background: THREE.Vector3;
  /** Text layer colours: bright, normal, dim, accent (see TEXT_STYLES). */
  text: THREE.Vector3[];
}

/** Pass 3: draws the scene as pixel-perfect glyphs, plus optional bloom glow (see ascii.frag). */
export class AsciiPass {
  private readonly pass: FullscreenPass<{
    uScene: U<THREE.Texture>;
    uLut: U<THREE.Texture>;
    uAtlas: U<THREE.Texture>;
    uBloom: U<THREE.Texture | null>;
    uBloomStrength: U<number>;
    uGrid: U<THREE.Vector2>;
    uGridOffset: U<THREE.Vector2>;
    uCellPx: U<number>;
    uExposure: U<number>;
    uRampLength: U<number>;
    uStarBase: U<number>;
    uStarLength: U<number>;
    uStarTint: U<THREE.Vector3>;
    uBackground: U<THREE.Vector3>;
    uText: U<THREE.Texture>;
    uTextBase: U<number>;
    uTextColors: U<THREE.Vector3[]>;
  }>;

  constructor(
    scene: THREE.Texture,
    lut: THREE.Texture,
    atlas: GlyphAtlas,
    colors: PaletteColors,
    text: THREE.Texture,
  ) {
    this.pass = new FullscreenPass(asciiFrag, {
      uScene: { value: scene },
      uLut: { value: lut },
      uAtlas: { value: atlas.texture },
      uBloom: { value: null },
      uBloomStrength: { value: 0 },
      uGrid: { value: new THREE.Vector2(1, 1) },
      uGridOffset: { value: new THREE.Vector2() },
      uCellPx: { value: 8 },
      uExposure: { value: 1 },
      uRampLength: { value: atlas.rampLength },
      uStarBase: { value: atlas.starBase },
      uStarLength: { value: atlas.starLength },
      uStarTint: { value: colors.starTint },
      uBackground: { value: colors.background },
      uText: { value: text },
      uTextBase: { value: atlas.textBase },
      uTextColors: { value: colors.text },
    });
  }

  setAtlas(atlas: GlyphAtlas): void {
    const u = this.pass.uniforms;
    u.uAtlas.value = atlas.texture;
    u.uRampLength.value = atlas.rampLength;
    u.uStarBase.value = atlas.starBase;
    u.uStarLength.value = atlas.starLength;
    u.uTextBase.value = atlas.textBase;
  }

  /** The text layer texture is replaced when the grid size changes. */
  setText(text: THREE.Texture): void {
    this.pass.uniforms.uText.value = text;
  }

  setGrid(grid: CharGrid): void {
    const u = this.pass.uniforms;
    u.uGrid.value.set(grid.cols, grid.rows);
    u.uGridOffset.value.set(grid.offsetX, grid.offsetY);
    u.uCellPx.value = grid.cellPx;
  }

  /** @param bloom blurred bright tones, or null for no glow */
  render(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget | null,
    exposure: number,
    bloom: THREE.Texture | null,
    bloomStrength: number,
  ): void {
    const u = this.pass.uniforms;
    u.uExposure.value = exposure;
    u.uBloom.value = bloom;
    u.uBloomStrength.value = bloom ? bloomStrength : 0;
    this.pass.render(renderer, target);
  }

  dispose(): void {
    this.pass.dispose();
  }
}
