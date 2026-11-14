import * as THREE from 'three';
import { anyCrtEffect, crtStrengths, settingsStore, type SettingsState } from '@/state/settings';
import { statsStore } from '@/state/stats';
import {
  buildGlyphAtlas,
  GlyphRasterizer,
  loadPixelFont,
  type GlyphAtlas,
} from '@/engine/display/glyphs/GlyphAtlas';
import { RAMPS } from '@/engine/display/glyphs/ramps';
import { autoGlyphScale, computeGrid, type CharGrid } from '@/engine/display/grid';
import { createLutTexture, hexToRgb, updateLutTexture } from '@/engine/display/palette/lut';
import { PALETTES } from '@/engine/display/palette/palettes';
import { AsciiPass, type PaletteColors } from '@/engine/display/passes/AsciiPass';
import { BloomPass } from '@/engine/display/passes/BloomPass';
import { CrtPass } from '@/engine/display/passes/CrtPass';
import { PresentPass } from '@/engine/display/passes/PresentPass';
import { ReadbackPass } from '@/engine/display/passes/ReadbackPass';
import type { QualityTier } from '@/engine/quality/QualityGovernor';

/** Smooth (non-ASCII) mode renders at a fraction of the screen and upscales. */
const SMOOTH_SCALE = 0.6;
const SMOOTH_MAX_HEIGHT = 600;
/** In ASCII mode stars are sized a bit under one cell, so each lands in a single cell. */
const STAR_CELL_FRACTION = 0.6;

/** What a scene needs to know about the buffer it renders into, after a layout change. */
export interface SceneLayout {
  /** width / height of the image the rays span */
  aspect: number;
  /** rows the vertical field of view is split into, for sizing stars */
  starRows: number;
}

/**
 * Everything between "a scene has been rendered into the scene buffer" and "pixels on screen".
 * It knows nothing about what the scene is: it owns the low-res scene buffer, the character grid,
 * glyph atlas, palette, and the bloom → ASCII (or smooth present) → CRT passes, plus readback for
 * copy as text.
 *
 *   scene buffer ──► BloomPass ──► AsciiPass ──┬──► CrtPass ──► screen
 *   (low-res)        (optional)    or Present  └──────────────► screen (when no CRT effect is on)
 *        └──► ReadbackPass (on demand: copy as text)
 */
export class DisplayPipeline {
  /** The scene renders into this each frame. Half-float, so channels can hold HDR values. */
  readonly sceneTarget: THREE.WebGLRenderTarget;

  private readonly lut: THREE.DataTexture;
  private readonly colors: PaletteColors;
  private readonly bloom = new BloomPass();
  private readonly ascii: AsciiPass;
  private readonly present: PresentPass;
  private readonly crt = new CrtPass();
  private readonly readback: ReadbackPass;

  private rasterizer: GlyphRasterizer;
  private atlas: GlyphAtlas;
  private grid: CharGrid | null = null;
  private disposed = false;
  /** The real pixel font has loaded and the atlas has been rebuilt with it. */
  fontReady = false;

  constructor(settings: SettingsState) {
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, // lets one tap average 2×2 texels when supersampling
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });

    const palette = PALETTES[settings.palette];
    this.lut = createLutTexture(palette);
    this.colors = {
      starTint: new THREE.Vector3(...hexToRgb(palette.starTint)),
      background: new THREE.Vector3(...hexToRgb(palette.background)),
    };

    // Until the pixel font has loaded, glyphs fall back to dither blocks; swapped in a moment later.
    this.rasterizer = new GlyphRasterizer(false);
    this.atlas = buildGlyphAtlas(this.rasterizer, RAMPS[settings.ramp].chars);

    const sceneTexture = this.sceneTarget.texture;
    this.ascii = new AsciiPass(sceneTexture, this.lut, this.atlas, this.colors);
    this.present = new PresentPass(sceneTexture, this.lut, this.colors);
    this.readback = new ReadbackPass(sceneTexture);

    void loadPixelFont().then((ready) => {
      if (this.disposed) return;
      if (!ready) console.warn('Pixel font unavailable; using dither-block glyphs.');
      this.rasterizer = new GlyphRasterizer(ready);
      this.rebuildAtlas();
      this.fontReady = true;
    });
  }

  /** Display settings that rebuild resources. Returns true when the layout must be recomputed. */
  onSettingsChange(s: SettingsState, prev: SettingsState): boolean {
    if (s.palette !== prev.palette) this.applyPalette(s);
    if (s.ramp !== prev.ramp) this.rebuildAtlas();
    return (
      s.ascii !== prev.ascii ||
      s.glyphScale !== prev.glyphScale ||
      s.columns !== prev.columns ||
      s.supersample !== prev.supersample ||
      s.quality !== prev.quality ||
      s.debugView !== prev.debugView
    );
  }

  /** ASCII glyphs are drawn for the final view only; debug views use the smooth present pass. */
  static asciiActive(s: SettingsState): boolean {
    return s.ascii && s.debugView === 'final';
  }

  /**
   * Sizes the scene buffer, grid and passes for a drawing buffer of `drawW`×`drawH` pixels
   * (`cssW`×`cssH` CSS pixels). `tier` is the auto-quality tier, or null for a fixed quality.
   */
  layout(
    drawW: number,
    drawH: number,
    cssW: number,
    cssH: number,
    s: SettingsState,
    tier: QualityTier | null,
  ): SceneLayout {
    let layout: SceneLayout;
    if (DisplayPipeline.asciiActive(s)) {
      const supersample = tier ? Math.min(s.supersample, tier.maxSupersample) : s.supersample;
      // auto quality may enlarge cells, but only when the glyph size itself is on auto
      const boost = tier && s.glyphScale === 0 && s.columns === 0 ? tier.scaleBoost : 0;
      const scale = boost ? autoGlyphScale(drawW) + boost : s.glyphScale;
      const grid = computeGrid(drawW, drawH, scale, s.columns);
      this.grid = grid;
      this.sceneTarget.setSize(grid.cols * supersample, grid.rows * supersample);
      layout = {
        aspect: grid.cols / grid.rows, // cells are square
        starRows: grid.rows / STAR_CELL_FRACTION,
      };
      this.bloom.setSize(grid.cols, grid.rows);
      this.ascii.setGrid(grid);
      this.crt.setSize(drawW, drawH, grid.scale);
      statsStore.setState({ cols: grid.cols, rows: grid.rows, glyphScale: grid.scale });
    } else {
      this.grid = null;
      const sceneH = Math.max(90, Math.min(SMOOTH_MAX_HEIGHT, Math.round(cssH * SMOOTH_SCALE)));
      const sceneW = Math.max(160, Math.round((sceneH * cssW) / cssH));
      this.sceneTarget.setSize(sceneW, sceneH);
      layout = { aspect: cssW / cssH, starRows: sceneH };
      this.crt.setSize(drawW, drawH, 1);
      statsStore.setState({ cols: 0, rows: 0, glyphScale: 0 });
    }
    return layout;
  }

  /** Draws the scene buffer to the screen through bloom, ASCII or smooth present, and CRT. */
  render(renderer: THREE.WebGLRenderer, s: SettingsState, timeMs: number): void {
    const fx = crtStrengths(s);
    const crtOn = s.debugView === 'final' && anyCrtEffect(fx);
    const out = crtOn ? this.crt.target : null;

    if (DisplayPipeline.asciiActive(s)) {
      let glow: THREE.Texture | null = null;
      if (s.bloom && s.bloomStrength > 0) {
        this.bloom.render(renderer, this.sceneTarget.texture, s.exposure);
        glow = this.bloom.texture;
      }
      this.ascii.render(renderer, out, s.exposure, glow, s.bloomStrength);
    } else {
      this.present.render(renderer, out, s.exposure, s.debugView);
    }

    if (crtOn) this.crt.render(renderer, fx, timeMs / 1000);
  }

  /**
   * Reads the last rendered scene back as text. In smooth mode (no grid on screen) the default grid
   * for a `drawW`×`drawH` drawing buffer is used.
   */
  captureText(renderer: THREE.WebGLRenderer, drawW: number, drawH: number, exposure: number) {
    const grid = this.grid ?? computeGrid(drawW, drawH, 0);
    return this.readback.read(renderer, grid.cols, grid.rows, this.atlas, exposure);
  }

  private applyPalette(s: SettingsState): void {
    const palette = PALETTES[s.palette];
    updateLutTexture(this.lut, palette);
    this.colors.starTint.set(...hexToRgb(palette.starTint));
    this.colors.background.set(...hexToRgb(palette.background));
  }

  private rebuildAtlas(): void {
    const old = this.atlas;
    // read the ramp at call time: the font load can finish after a ramp change
    this.atlas = buildGlyphAtlas(this.rasterizer, RAMPS[settingsStore.getState().ramp].chars);
    this.ascii.setAtlas(this.atlas);
    old.texture.dispose();
  }

  dispose(): void {
    this.disposed = true;
    this.bloom.dispose();
    this.ascii.dispose();
    this.present.dispose();
    this.crt.dispose();
    this.readback.dispose();
    this.atlas.texture.dispose();
    this.lut.dispose();
    this.sceneTarget.dispose();
  }
}
