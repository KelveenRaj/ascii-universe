import * as THREE from 'three';
import asciiFrag from '../shaders/ascii.frag';
import blackholeFrag from '../shaders/blackhole.frag';
import presentFrag from '../shaders/present.frag';
import { DEBUG_VIEWS, settingsStore, type DebugView, type SettingsState } from '../state/settings';
import { statsStore } from '../state/stats';
import { CameraController, VIEW_PRESETS, type ViewPreset } from './camera/CameraController';
import { InputManager, isTypingTarget } from './camera/InputManager';
import { FullscreenPass } from './FullscreenPass';
import {
  buildGlyphAtlas,
  GlyphRasterizer,
  loadPixelFont,
  type GlyphAtlas,
} from './glyphs/GlyphAtlas';
import { RAMP_IDS, RAMPS } from './glyphs/ramps';
import { computeGrid, MAX_GLYPH_SCALE, type CharGrid } from './grid';
import { createLutTexture, hexToRgb, updateLutTexture } from './palette/lut';
import { PALETTE_IDS, PALETTES } from './palette/palettes';

const MAX_PIXEL_RATIO = 2;
const FOV_DEG = 50;
/** Smooth (non-ASCII) mode renders at a fraction of the screen and upscales. */
const SMOOTH_SCALE = 0.6;
const SMOOTH_MAX_HEIGHT = 600;
const STATS_INTERVAL_MS = 250;

type U<T> = THREE.IUniform<T>;

/**
 * Owns the WebGL renderer, the pass graph and the render loop. Plain TypeScript: React only creates
 * and disposes it (see BlackHoleCanvas), it never drives frames.
 *
 * Frame: scenePass (black hole, low-res half-float) → asciiPass (glyphs, to screen)
 *                                                   ↘ presentPass (smooth / debug views, to screen)
 */
export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 1000);
  private readonly controller: CameraController;
  private readonly input: InputManager;
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly lut: THREE.DataTexture;
  private readonly drawSize = new THREE.Vector2();
  private readonly unsubscribers: Array<() => void> = [];
  private rasterizer: GlyphRasterizer;
  private atlas: GlyphAtlas;
  private grid: CharGrid | null = null;

  private readonly scenePass: FullscreenPass<{
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

  private readonly asciiPass: FullscreenPass<{
    uScene: U<THREE.Texture>;
    uLut: U<THREE.Texture>;
    uAtlas: U<THREE.Texture>;
    uGrid: U<THREE.Vector2>;
    uGridOffset: U<THREE.Vector2>;
    uCellPx: U<number>;
    uExposure: U<number>;
    uRampLength: U<number>;
    uStarBase: U<number>;
    uStarLength: U<number>;
    uStarTint: U<THREE.Vector3>;
    uBackground: U<THREE.Vector3>;
  }>;

  private readonly presentPass: FullscreenPass<{
    uScene: U<THREE.Texture>;
    uLut: U<THREE.Texture>;
    uStarTint: U<THREE.Vector3>;
    uBackground: U<THREE.Vector3>;
    uExposure: U<number>;
    uDebugView: U<number>;
  }>;

  private disposed = false;
  private lastFrameMs = -1;
  private diskTime = 0;
  /** Dev-only: freeze the disk clock at a given time (for reproducible screenshots). */
  private frozenTime: number | null = null;
  private fpsFrames = 0;
  private fpsWindowStart = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // every pass is a full-screen shader; MSAA would only cost memory
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;

    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });

    const settings = settingsStore.getState();
    const palette = PALETTES[settings.palette];
    this.lut = createLutTexture(palette);

    // Until the pixel font has loaded, glyphs fall back to dither blocks; swapped in a moment later.
    this.rasterizer = new GlyphRasterizer(false);
    this.atlas = buildGlyphAtlas(this.rasterizer, RAMPS[settings.ramp].chars);

    const starTint = new THREE.Vector3(...hexToRgb(palette.starTint));
    const background = new THREE.Vector3(...hexToRgb(palette.background));

    this.scenePass = new FullscreenPass(blackholeFrag, {
      uCamPos: { value: new THREE.Vector3() },
      uCamBasis: { value: new THREE.Matrix3() },
      uTanHalfFov: { value: Math.tan((FOV_DEG * Math.PI) / 360) },
      uAspect: { value: 1 },
      uPixelAngle: { value: 0.002 },
      uTime: { value: 0 },
      uMaxSteps: { value: settings.maxSteps },
      uDiskInner: { value: settings.diskInner },
      uDiskOuter: { value: settings.diskOuter },
      uBeaming: { value: settings.beaming },
      uStarDensity: { value: settings.starDensity },
    });

    this.asciiPass = new FullscreenPass(asciiFrag, {
      uScene: { value: this.sceneTarget.texture },
      uLut: { value: this.lut },
      uAtlas: { value: this.atlas.texture },
      uGrid: { value: new THREE.Vector2(1, 1) },
      uGridOffset: { value: new THREE.Vector2() },
      uCellPx: { value: 8 },
      uExposure: { value: settings.exposure },
      uRampLength: { value: this.atlas.rampLength },
      uStarBase: { value: this.atlas.starBase },
      uStarLength: { value: this.atlas.starLength },
      uStarTint: { value: starTint },
      uBackground: { value: background },
    });

    this.presentPass = new FullscreenPass(presentFrag, {
      uScene: { value: this.sceneTarget.texture },
      uLut: { value: this.lut },
      uStarTint: { value: starTint },
      uBackground: { value: background },
      uExposure: { value: settings.exposure },
      uDebugView: { value: 0 },
    });

    // Settings that need resources rebuilt are handled once on change, not checked every frame.
    this.unsubscribers.push(settingsStore.subscribe((s, prev) => this.onSettingsChange(s, prev)));

    this.controller = new CameraController(Math.tan((FOV_DEG * Math.PI) / 360));
    this.controller.attractEnabled = settings.attractMode;
    this.input = new InputManager(canvas, this.controller);
    window.addEventListener('keydown', this.onKey);
    if (import.meta.env.DEV) this.applyDevQueryParams();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    void loadPixelFont().then((ready) => {
      if (this.disposed) return;
      if (!ready) console.warn('Pixel font unavailable; using dither-block glyphs.');
      this.rasterizer = new GlyphRasterizer(ready);
      this.rebuildAtlas();
    });

    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private onSettingsChange(s: SettingsState, prev: SettingsState): void {
    if (s.palette !== prev.palette) this.applyPalette();
    if (s.attractMode !== prev.attractMode) this.controller.attractEnabled = s.attractMode;
    if (s.ramp !== prev.ramp) this.rebuildAtlas();
    if (
      s.ascii !== prev.ascii ||
      s.glyphScale !== prev.glyphScale ||
      s.supersample !== prev.supersample ||
      s.debugView !== prev.debugView
    ) {
      this.resize();
    }
  }

  private applyPalette(): void {
    const palette = PALETTES[settingsStore.getState().palette];
    updateLutTexture(this.lut, palette);
    // the ascii and present passes share these vectors
    this.asciiPass.uniforms.uStarTint.value.set(...hexToRgb(palette.starTint));
    this.asciiPass.uniforms.uBackground.value.set(...hexToRgb(palette.background));
  }

  private rebuildAtlas(): void {
    const old = this.atlas;
    this.atlas = buildGlyphAtlas(this.rasterizer, RAMPS[settingsStore.getState().ramp].chars);
    const u = this.asciiPass.uniforms;
    u.uAtlas.value = this.atlas.texture;
    u.uRampLength.value = this.atlas.rampLength;
    u.uStarBase.value = this.atlas.starBase;
    u.uStarLength.value = this.atlas.starLength;
    old.texture.dispose();
  }

  /** e.g. ?preset=eht&view=redshift&dist=20&t=12&ramp=blocks&scale=2 — for dev screenshots. */
  private applyDevQueryParams(): void {
    const q = new URLSearchParams(window.location.search);
    const s = settingsStore.getState();
    const preset = q.get('preset');
    if (preset && preset in VIEW_PRESETS) this.controller.setPreset(preset as ViewPreset, true);
    const view = q.get('view');
    if (view && (DEBUG_VIEWS as readonly string[]).includes(view)) {
      s.set('debugView', view as DebugView);
    }
    const goal = this.controller.goal;
    const dist = Number(q.get('dist'));
    if (dist > 0) goal.distance = dist;
    const elev = q.get('elev');
    if (elev !== null) goal.elevation = (Number(elev) * Math.PI) / 180;
    const yaw = q.get('yaw');
    if (yaw !== null) goal.yaw = (Number(yaw) * Math.PI) / 180;
    const roll = q.get('roll');
    if (roll !== null) goal.roll = (Number(roll) * Math.PI) / 180;
    this.controller.snap();
    const t = q.get('t');
    if (t !== null) this.frozenTime = Number(t);
    const ramp = q.get('ramp');
    if (ramp && ramp in RAMPS) s.set('ramp', ramp as keyof typeof RAMPS);
    const palette = q.get('palette');
    if (palette && palette in PALETTES) s.set('palette', palette as keyof typeof PALETTES);
    const scale = Number(q.get('scale'));
    if (scale >= 1) s.set('glyphScale', scale);
    if (q.get('ascii') === '0') s.set('ascii', false);
    if (q.get('ss') === '1') s.set('supersample', 1);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTypingTarget(e.target)) return;
    const s = settingsStore.getState();
    const cycle = <T>(list: readonly T[], current: T) =>
      list[(list.indexOf(current) + 1) % list.length];
    switch (e.key) {
      case 'v':
      case 'V':
        s.cycleDebugView();
        break;
      case ' ':
        e.preventDefault();
        s.togglePaused();
        break;
      case 'g':
      case 'G':
        s.set('ascii', !s.ascii);
        break;
      case 'r':
      case 'R':
        s.set('ramp', cycle(RAMP_IDS, s.ramp));
        break;
      case 'p':
      case 'P':
        s.set('palette', cycle(PALETTE_IDS, s.palette));
        break;
      case '[':
      case ']': {
        const current = this.grid?.scale ?? 1;
        const next = current + (e.key === ']' ? 1 : -1);
        s.set('glyphScale', Math.min(MAX_GLYPH_SCALE, Math.max(1, next)));
        break;
      }
    }
  };

  /** ASCII glyphs are drawn for the final view only; debug views use the smooth present pass. */
  private get asciiActive(): boolean {
    const s = settingsStore.getState();
    return s.ascii && s.debugView === 'final';
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false); // CSS owns the element size
    this.renderer.getDrawingBufferSize(this.drawSize);

    const s = settingsStore.getState();
    const u = this.scenePass.uniforms;
    let sceneW: number;
    let sceneH: number;

    if (this.asciiActive) {
      const grid = computeGrid(this.drawSize.x, this.drawSize.y, s.glyphScale);
      this.grid = grid;
      sceneW = grid.cols * s.supersample;
      sceneH = grid.rows * s.supersample;
      u.uAspect.value = grid.cols / grid.rows; // cells are square
      // stars a bit under one cell wide, so each lands in a single cell instead of smearing into two
      u.uPixelAngle.value = (0.6 * 2 * u.uTanHalfFov.value) / grid.rows;
      const a = this.asciiPass.uniforms;
      a.uGrid.value.set(grid.cols, grid.rows);
      a.uGridOffset.value.set(grid.offsetX, grid.offsetY);
      a.uCellPx.value = grid.cellPx;
      statsStore.setState({ cols: grid.cols, rows: grid.rows, glyphScale: grid.scale });
    } else {
      this.grid = null;
      sceneH = Math.max(90, Math.min(SMOOTH_MAX_HEIGHT, Math.round(height * SMOOTH_SCALE)));
      sceneW = Math.max(160, Math.round((sceneH * width) / height));
      u.uAspect.value = width / height;
      u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / sceneH;
      statsStore.setState({ cols: 0, rows: 0, glyphScale: 0 });
    }

    this.sceneTarget.setSize(sceneW, sceneH);
    statsStore.setState({ sceneWidth: sceneW, sceneHeight: sceneH });
  }

  private frame(timeMs: number): void {
    const dt = this.lastFrameMs < 0 ? 0 : Math.min((timeMs - this.lastFrameMs) / 1000, 0.1);
    this.lastFrameMs = timeMs;
    const s = settingsStore.getState();

    if (!s.paused) this.diskTime += dt * s.diskSpeed;
    this.input.update(dt);
    this.controller.update(dt);
    this.controller.apply(this.camera);

    const u = this.scenePass.uniforms;
    u.uCamPos.value.copy(this.camera.position);
    u.uCamBasis.value.setFromMatrix4(this.camera.matrixWorld);
    u.uTime.value = this.frozenTime ?? this.diskTime;
    u.uMaxSteps.value = s.maxSteps;
    u.uDiskInner.value = s.diskInner;
    u.uDiskOuter.value = s.diskOuter;
    u.uBeaming.value = s.beaming;
    u.uStarDensity.value = s.starDensity;

    this.scenePass.render(this.renderer, this.sceneTarget);

    if (this.asciiActive) {
      this.asciiPass.uniforms.uExposure.value = s.exposure;
      this.asciiPass.render(this.renderer, null);
    } else {
      const p = this.presentPass.uniforms;
      p.uExposure.value = s.exposure;
      p.uDebugView.value = DEBUG_VIEWS.indexOf(s.debugView);
      this.presentPass.render(this.renderer, null);
    }

    this.updateStats(timeMs);
  }

  private updateStats(timeMs: number): void {
    this.fpsFrames++;
    const elapsed = timeMs - this.fpsWindowStart;
    if (elapsed < STATS_INTERVAL_MS) return;
    const pos = this.camera.position;
    const distance = pos.length();
    statsStore.setState({
      fps: Math.round((this.fpsFrames * 1000) / elapsed),
      distance,
      inclination: (Math.acos(Math.abs(pos.y) / Math.max(distance, 1e-6)) * 180) / Math.PI,
      attract: this.controller.attractActive,
    });
    this.fpsFrames = 0;
    this.fpsWindowStart = timeMs;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKey);
    this.unsubscribers.forEach((off) => off());
    this.input.dispose();
    this.scenePass.dispose();
    this.asciiPass.dispose();
    this.presentPass.dispose();
    this.sceneTarget.dispose();
    this.atlas.texture.dispose();
    this.lut.dispose();
    // Deliberately NOT calling forceContextLoss(): React StrictMode remounts on the same canvas,
    // and getContext() would hand the new renderer the lost context.
    this.renderer.dispose();
  }
}
