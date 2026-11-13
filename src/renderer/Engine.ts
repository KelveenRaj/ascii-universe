import * as THREE from 'three';
import { onCommand } from '../state/commands';
import { AUTO_START_TIER, MAX_PIXEL_RATIO } from '../state/deviceTier';
import {
  anyCrtEffect,
  crtStrengths,
  DEBUG_VIEWS,
  settingsStore,
  type DebugView,
  stepsFor,
  type SettingsState,
} from '../state/settings';
import { statsStore } from '../state/stats';
import { uiStore } from '../state/ui';
import { CameraController, VIEW_PRESETS, type ViewPreset } from './camera/CameraController';
import { InputManager, isTypingTarget } from './camera/InputManager';
import {
  buildGlyphAtlas,
  GlyphRasterizer,
  loadPixelFont,
  type GlyphAtlas,
} from './glyphs/GlyphAtlas';
import { RAMP_IDS, RAMPS, type RampId } from './glyphs/ramps';
import { autoGlyphScale, computeGrid, MAX_GLYPH_SCALE, type CharGrid } from './grid';
import { createLutTexture, hexToRgb, updateLutTexture } from './palette/lut';
import { PALETTE_IDS, PALETTES, type PaletteId } from './palette/palettes';
import { AsciiPass, type PaletteColors } from './passes/AsciiPass';
import { BloomPass } from './passes/BloomPass';
import { CrtPass } from './passes/CrtPass';
import { PresentPass } from './passes/PresentPass';
import { ReadbackPass } from './passes/ReadbackPass';
import { ScenePass } from './passes/ScenePass';
import { QualityGovernor } from './QualityGovernor';

const FOV_DEG = 50;
/** Smooth (non-ASCII) mode renders at a fraction of the screen and upscales. */
const SMOOTH_SCALE = 0.6;
const SMOOTH_MAX_HEIGHT = 600;
/** In ASCII mode stars are sized a bit under one cell, so each lands in a single cell. */
const STAR_CELL_FRACTION = 0.6;
const STATS_INTERVAL_MS = 250;

/**
 * Owns the WebGL renderer, the passes and the render loop. Plain TypeScript: React only creates and
 * disposes it (see BlackHoleCanvas), it never drives frames.
 *
 *   ScenePass ──► BloomPass ──► AsciiPass ──┬──► CrtPass ──► screen
 *   (low-res)     (optional)    or Present  └──────────────► screen (when no CRT effect is on)
 *       └──► ReadbackPass (on demand: copy as text)
 */
export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 1000);
  private readonly controller: CameraController;
  private readonly input: InputManager;
  private readonly lut: THREE.DataTexture;
  private readonly colors: PaletteColors;
  private readonly drawSize = new THREE.Vector2();
  private readonly unsubscribers: Array<() => void> = [];
  private readonly governor = new QualityGovernor(AUTO_START_TIER);

  private readonly scene: ScenePass;
  private readonly bloom: BloomPass;
  private readonly ascii: AsciiPass;
  private readonly present: PresentPass;
  private readonly crt: CrtPass;
  private readonly readback: ReadbackPass;

  private rasterizer: GlyphRasterizer;
  private atlas: GlyphAtlas;
  private grid: CharGrid | null = null;

  private disposed = false;
  private contextLost = false;
  private lastFrameMs = -1;
  private diskTime = 0;
  /** Dev-only: freeze the disk clock at a given time (for reproducible screenshots). */
  private frozenTime: number | null = null;
  private fpsFrames = 0;
  private fpsWindowStart = 0;
  private fontReady = false;

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

    const settings = settingsStore.getState();
    const palette = PALETTES[settings.palette];
    this.lut = createLutTexture(palette);
    this.colors = {
      starTint: new THREE.Vector3(...hexToRgb(palette.starTint)),
      background: new THREE.Vector3(...hexToRgb(palette.background)),
    };

    // Until the pixel font has loaded, glyphs fall back to dither blocks; swapped in a moment later.
    this.rasterizer = new GlyphRasterizer(false);
    this.atlas = buildGlyphAtlas(this.rasterizer, RAMPS[settings.ramp].chars);

    const tanHalfFov = Math.tan((FOV_DEG * Math.PI) / 360);
    this.scene = new ScenePass(tanHalfFov);
    this.bloom = new BloomPass();
    this.ascii = new AsciiPass(this.scene.target.texture, this.lut, this.atlas, this.colors);
    this.present = new PresentPass(this.scene.target.texture, this.lut, this.colors);
    this.crt = new CrtPass();
    this.readback = new ReadbackPass(this.scene.target.texture);

    this.controller = new CameraController(tanHalfFov);
    this.controller.attractEnabled = settings.attractMode;
    this.input = new InputManager(canvas, this.controller);

    // Settings that need resources rebuilt are handled once on change, not checked every frame.
    this.unsubscribers.push(settingsStore.subscribe((s, prev) => this.onSettingsChange(s, prev)));
    this.unsubscribers.push(
      onCommand((cmd) => {
        if (cmd.type === 'preset') this.controller.setPreset(cmd.preset);
        else if (cmd.type === 'resetView') this.controller.reset();
        else if (cmd.type === 'captureText') this.captureText();
      }),
    );
    window.addEventListener('keydown', this.onKey);
    // three.js itself keeps the context restorable and rebuilds its GL state on restore;
    // we only show an overlay meanwhile and resync timing and sizes afterwards.
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    if (import.meta.env.DEV) this.applyDevQueryParams();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    void loadPixelFont().then((ready) => {
      if (this.disposed) return;
      if (!ready) console.warn('Pixel font unavailable; using dither-block glyphs.');
      this.rasterizer = new GlyphRasterizer(ready);
      this.rebuildAtlas();
      this.fontReady = true;
    });

    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private onSettingsChange(s: SettingsState, prev: SettingsState): void {
    if (s.palette !== prev.palette) this.applyPalette();
    if (s.ramp !== prev.ramp) this.rebuildAtlas();
    if (s.attractMode !== prev.attractMode) this.controller.attractEnabled = s.attractMode;
    if (s.quality !== prev.quality && s.quality === 'auto') this.governor.reset();
    if (
      s.ascii !== prev.ascii ||
      s.glyphScale !== prev.glyphScale ||
      s.columns !== prev.columns ||
      s.supersample !== prev.supersample ||
      s.quality !== prev.quality ||
      s.debugView !== prev.debugView
    ) {
      this.resize();
    }
  }

  private applyPalette(): void {
    const palette = PALETTES[settingsStore.getState().palette];
    updateLutTexture(this.lut, palette);
    this.colors.starTint.set(...hexToRgb(palette.starTint));
    this.colors.background.set(...hexToRgb(palette.background));
  }

  private rebuildAtlas(): void {
    const old = this.atlas;
    this.atlas = buildGlyphAtlas(this.rasterizer, RAMPS[settingsStore.getState().ramp].chars);
    this.ascii.setAtlas(this.atlas);
    old.texture.dispose();
  }

  /** e.g. ?preset=eht&view=redshift&dist=20&t=12&ramp=blocks&scale=2&crt=0 — for dev screenshots. */
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
    const deg = (name: string) => {
      const v = q.get(name);
      return v === null ? null : (Number(v) * Math.PI) / 180;
    };
    const dist = Number(q.get('dist'));
    if (dist > 0) goal.distance = dist;
    goal.elevation = deg('elev') ?? goal.elevation;
    goal.yaw = deg('yaw') ?? goal.yaw;
    goal.roll = deg('roll') ?? goal.roll;
    this.controller.snap();
    const t = q.get('t');
    if (t !== null) this.frozenTime = Number(t);
    const ramp = q.get('ramp');
    if (ramp && ramp in RAMPS) s.set('ramp', ramp as RampId);
    const palette = q.get('palette');
    if (palette && palette in PALETTES) s.set('palette', palette as PaletteId);
    const scale = Number(q.get('scale'));
    if (scale >= 1) s.set('glyphScale', scale);
    if (q.get('ascii') === '0') s.set('ascii', false);
    if (q.get('ss') === '1') s.set('supersample', 1);
    if (q.get('crt') === '0') s.set('crt', false);
    if (q.get('bloom') === '0') s.set('bloom', false);
    if (q.get('mask') === '1') s.set('phosphorMask', true);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTypingTarget(e.target)) return;
    const s = settingsStore.getState();
    const cycle = <T>(list: readonly T[], current: T) =>
      list[(list.indexOf(current) + 1) % list.length];
    switch (e.key.toLowerCase()) {
      case 'v':
        s.cycleDebugView();
        break;
      case ' ':
        e.preventDefault();
        s.togglePaused();
        break;
      case 'g':
        s.set('ascii', !s.ascii);
        break;
      case 'r':
        s.set('ramp', cycle(RAMP_IDS, s.ramp));
        break;
      case 'p':
        s.set('palette', cycle(PALETTE_IDS, s.palette));
        break;
      case 'b':
        s.set('bloom', !s.bloom);
        break;
      case 't':
        s.set('crt', !s.crt);
        break;
      case 'c':
        this.captureText();
        break;
      case '[':
      case ']': {
        const current = this.grid?.scale ?? 1;
        const next = current + (e.key === ']' ? 1 : -1);
        s.set('columns', 0);
        s.set('glyphScale', Math.min(MAX_GLYPH_SCALE, Math.max(1, Math.round(next))));
        break;
      }
    }
  };

  private onContextLost = () => {
    this.contextLost = true;
    statsStore.setState({ signalLost: true });
  };

  private onContextRestored = () => {
    this.contextLost = false;
    this.lastFrameMs = -1;
    this.governor.restartMeasuring();
    this.resize();
    statsStore.setState({ signalLost: false });
  };

  /** ASCII glyphs are drawn for the final view only; debug views use the smooth present pass. */
  private get asciiActive(): boolean {
    const s = settingsStore.getState();
    return s.ascii && s.debugView === 'final';
  }

  private get autoTier() {
    return settingsStore.getState().quality === 'auto' ? this.governor.tier : null;
  }

  /**
   * Reads the last rendered scene back as text and opens the copy-as-text dialog. In smooth mode
   * (no grid on screen) the default grid for this window size is used.
   */
  private captureText(): void {
    if (this.contextLost) return;
    const s = settingsStore.getState();
    const grid = this.grid ?? computeGrid(this.drawSize.x, this.drawSize.y, 0);
    const text = this.readback.read(this.renderer, grid.cols, grid.rows, this.atlas, s.exposure);
    uiStore.getState().setTextExport(text);
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false); // CSS owns the element size
    this.renderer.getDrawingBufferSize(this.drawSize);
    const s = settingsStore.getState();
    const tier = this.autoTier;

    if (this.asciiActive) {
      const supersample = tier ? Math.min(s.supersample, tier.maxSupersample) : s.supersample;
      // auto quality may enlarge cells, but only when the glyph size itself is on auto
      const boost = tier && s.glyphScale === 0 && s.columns === 0 ? tier.scaleBoost : 0;
      const scale = boost ? autoGlyphScale(this.drawSize.x) + boost : s.glyphScale;
      const grid = computeGrid(this.drawSize.x, this.drawSize.y, scale, s.columns);
      this.grid = grid;
      this.scene.setSize(
        grid.cols * supersample,
        grid.rows * supersample,
        grid.cols / grid.rows, // cells are square
        grid.rows / STAR_CELL_FRACTION,
      );
      this.bloom.setSize(grid.cols, grid.rows);
      this.ascii.setGrid(grid);
      this.crt.setSize(this.drawSize.x, this.drawSize.y, grid.scale);
      statsStore.setState({ cols: grid.cols, rows: grid.rows, glyphScale: grid.scale });
    } else {
      this.grid = null;
      const sceneH = Math.max(90, Math.min(SMOOTH_MAX_HEIGHT, Math.round(height * SMOOTH_SCALE)));
      const sceneW = Math.max(160, Math.round((sceneH * width) / height));
      this.scene.setSize(sceneW, sceneH, width / height, sceneH);
      this.crt.setSize(this.drawSize.x, this.drawSize.y, 1);
      statsStore.setState({ cols: 0, rows: 0, glyphScale: 0 });
    }

    // a resize hitches a frame or two; don't let that count against the frame rate
    this.governor.restartMeasuring();
    const t = this.scene.target;
    statsStore.setState({ sceneWidth: t.width, sceneHeight: t.height });
  }

  private frame(timeMs: number): void {
    const frameMs = this.lastFrameMs < 0 ? 0 : timeMs - this.lastFrameMs;
    this.lastFrameMs = timeMs;
    if (this.contextLost) return;
    const dt = Math.min(frameMs / 1000, 0.1);
    const s = settingsStore.getState();

    if (s.quality === 'auto') {
      const before = this.governor.tier;
      if (this.governor.sample(frameMs)) {
        const after = this.governor.tier;
        if (
          after.maxSupersample !== before.maxSupersample ||
          after.scaleBoost !== before.scaleBoost
        ) {
          this.resize();
        }
      }
    }

    if (!s.paused) this.diskTime += dt * s.diskSpeed;
    this.input.update(dt);
    this.controller.update(dt);
    this.controller.apply(this.camera);

    const tier = this.autoTier;
    const steps = tier ? tier.steps : stepsFor(s.quality);
    this.scene.render(this.renderer, this.camera, s, this.frozenTime ?? this.diskTime, steps);

    const fx = crtStrengths(s);
    const crtOn = s.debugView === 'final' && anyCrtEffect(fx);
    const out = crtOn ? this.crt.target : null;

    if (this.asciiActive) {
      let glow: THREE.Texture | null = null;
      if (s.bloom && s.bloomStrength > 0) {
        this.bloom.render(this.renderer, this.scene.target.texture, s.exposure);
        glow = this.bloom.texture;
      }
      this.ascii.render(this.renderer, out, s.exposure, glow, s.bloomStrength);
    } else {
      this.present.render(this.renderer, out, s.exposure, s.debugView);
    }

    if (crtOn) this.crt.render(this.renderer, fx, timeMs / 1000);

    if (this.fontReady && !statsStore.getState().ready) statsStore.setState({ ready: true });
    this.updateStats(timeMs, steps, tier ? `AUTO·${tier.name}` : s.quality.toUpperCase());
  }

  private updateStats(timeMs: number, steps: number, qualityLabel: string): void {
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
      steps,
      qualityLabel,
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
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.unsubscribers.forEach((off) => off());
    this.input.dispose();
    this.scene.dispose();
    this.bloom.dispose();
    this.ascii.dispose();
    this.present.dispose();
    this.crt.dispose();
    this.readback.dispose();
    this.atlas.texture.dispose();
    this.lut.dispose();
    // Deliberately NOT calling forceContextLoss(): React StrictMode remounts on the same canvas,
    // and getContext() would hand the new renderer the lost context.
    this.renderer.dispose();
  }
}
