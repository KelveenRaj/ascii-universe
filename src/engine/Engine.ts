import * as THREE from 'three';
import { onCommand } from '@/state/commands';
import { AUTO_START_TIER, MAX_PIXEL_RATIO } from '@/state/deviceTier';
import { settingsStore, stepsFor, type SettingsState } from '@/state/settings';
import { statsStore } from '@/state/stats';
import { uiStore } from '@/state/ui';
import { CameraController } from '@/engine/camera/CameraController';
import { InputManager } from '@/engine/camera/InputManager';
import { applyDevQueryParams } from '@/engine/devParams';
import { DisplayPipeline } from '@/engine/display/DisplayPipeline';
import { cellAt } from '@/engine/display/grid';
import { drawLabel, type LabelRect } from '@/engine/display/labels';
import { QualityGovernor } from '@/engine/quality/QualityGovernor';
import type { SceneInstance, SceneModule } from '@/engine/scene/SceneModule';
import { Warp } from '@/engine/transition/Warp';
import { activeBody, activeScene, navigationStore } from '@/state/navigation';
import { sceneParamsStore } from '@/state/sceneParams';

const FOV_DEG = 50;
const STATS_INTERVAL_MS = 250;
/** After a warp the camera starts this many times further out than the first preset and eases in. */
const ARRIVE_FROM = 2.5;
/** A press that moves less than this (CSS px) is a click, not a drag. */
const CLICK_SLOP_PX = 5;

/**
 * Owns the WebGL renderer and the render loop. Plain TypeScript: React only creates and disposes it
 * (see EngineCanvas), it never drives frames.
 *
 * Each frame: camera → active scene renders into the display's scene buffer → DisplayPipeline to
 * the screen. The scene is anything implementing SceneModule (see engine/scene/SceneModule.ts).
 *
 * The scene follows the navigation store: when you move to a body rendered by another scene, a
 * Warp plays and the scene is swapped at its midpoint, while the screen is dark. Clicking a label
 * that has a `target` moves there.
 */
export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 1000);
  private readonly controller: CameraController;
  private readonly input: InputManager;
  private readonly drawSize = new THREE.Vector2();
  private readonly unsubscribers: Array<() => void> = [];
  private readonly governor = new QualityGovernor(AUTO_START_TIER);
  private readonly display: DisplayPipeline;
  private scene: SceneInstance;
  private sceneId: string;
  private readonly tanHalfFov: number;
  /** The transition in progress, if any. */
  private warp: Warp | null = null;
  /** Clickable labels from the last frame, with the body each one warps to. */
  private labelHits: Array<{ rect: LabelRect; target: string }> = [];
  private pressAt: { x: number; y: number } | null = null;

  private disposed = false;
  private contextLost = false;
  private lastFrameMs = -1;
  /** Dev-only: freeze the scene clock at a given time (for reproducible screenshots). */
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

    const settings = settingsStore.getState();
    const module = activeScene();
    this.sceneId = module.id;
    this.display = new DisplayPipeline(settings, module);

    const tanHalfFov = Math.tan((FOV_DEG * Math.PI) / 360);
    this.tanHalfFov = tanHalfFov;
    this.scene = module.create({ tanHalfFov });
    this.controller = new CameraController(tanHalfFov, module.camera);
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
    // three.js itself keeps the context restorable and rebuilds its GL state on restore;
    // we only show an overlay meanwhile and resync timing and sizes afterwards.
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    canvas.addEventListener('pointerdown', this.onPress);
    canvas.addEventListener('pointermove', this.onHover);
    canvas.addEventListener('click', this.onClick);
    if (import.meta.env.DEV) this.frozenTime = applyDevQueryParams(this.controller);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private onSettingsChange(s: SettingsState, prev: SettingsState): void {
    const relayout = this.display.onSettingsChange(s, prev);
    if (s.attractMode !== prev.attractMode) this.controller.attractEnabled = s.attractMode;
    if (s.quality !== prev.quality && s.quality === 'auto') this.governor.reset();
    if (relayout) this.resize();
  }

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

  // ---- clicking labels ----------------------------------------------------------------------

  /** The warp target under a CSS-pixel position on the canvas, if any. */
  private labelTargetAt(clientX: number, clientY: number): string | null {
    const grid = this.display.currentGrid;
    if (!grid || this.labelHits.length === 0) return null;
    const box = this.canvas.getBoundingClientRect();
    const sx = this.drawSize.x / Math.max(1, box.width);
    const sy = this.drawSize.y / Math.max(1, box.height);
    const cell = cellAt(grid, this.drawSize.y, (clientX - box.left) * sx, (clientY - box.top) * sy);
    if (!cell) return null;
    const hit = this.labelHits.find(
      ({ rect }) =>
        cell.col >= rect.col0 &&
        cell.col <= rect.col1 &&
        cell.row >= rect.row0 &&
        cell.row <= rect.row1,
    );
    return hit?.target ?? null;
  }

  private onPress = (e: PointerEvent) => {
    this.pressAt = { x: e.clientX, y: e.clientY };
  };

  private onHover = (e: PointerEvent) => {
    if (e.buttons !== 0) return;
    this.canvas.style.cursor = this.labelTargetAt(e.clientX, e.clientY) ? 'pointer' : '';
  };

  private onClick = (e: MouseEvent) => {
    const press = this.pressAt;
    this.pressAt = null;
    if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP_PX) return;
    const target = this.labelTargetAt(e.clientX, e.clientY);
    if (target) navigationStore.getState().goTo(target);
  };

  // ---- scene switching ----------------------------------------------------------------------

  /** Starts a warp when navigation has moved to a body rendered by another scene. */
  private checkNavigation(): void {
    if (this.warp) return;
    const module = activeScene();
    if (module.id === this.sceneId) return;
    const body = activeBody();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.warp = new Warp(`WARP > ${body.designation ?? body.name.toUpperCase()}`, reduced);
  }

  /** Swaps the running scene for `module` (at a warp's midpoint, while the screen is dark). */
  private switchScene(module: SceneModule): void {
    this.scene.dispose();
    this.sceneId = module.id;
    this.display.setScene(module, settingsStore.getState());
    this.scene = module.create({ tanHalfFov: this.tanHalfFov });
    this.controller.setSetup(module.camera, ARRIVE_FROM);
    this.labelHits = [];
    this.resize(); // gives the new scene its layout
  }

  private advanceWarp(dt: number): void {
    const warp = this.warp;
    if (!warp) return;
    warp.update(dt);
    if (warp.takeSwap()) {
      const module = activeScene(); // wherever navigation points now, even if it changed mid-warp
      if (module.id !== this.sceneId) this.switchScene(module);
    }
    this.display.fade = warp.fade;
    if (warp.done) {
      this.warp = null;
      this.display.fade = 1;
    }
  }

  private get autoTier() {
    return settingsStore.getState().quality === 'auto' ? this.governor.tier : null;
  }

  /** Reads the last rendered scene back as text and opens the copy-as-text dialog. */
  private captureText(): void {
    if (this.contextLost) return;
    const { exposure } = settingsStore.getState();
    const text = this.display.captureText(
      this.renderer,
      this.drawSize.x,
      this.drawSize.y,
      exposure,
    );
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
    const layout = this.display.layout(
      this.drawSize.x,
      this.drawSize.y,
      width,
      height,
      s,
      this.autoTier,
    );
    this.scene.setLayout(layout);

    // a resize hitches a frame or two; don't let that count against the frame rate
    this.governor.restartMeasuring();
    const t = this.display.sceneTarget;
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

    this.checkNavigation();
    this.advanceWarp(dt);
    this.input.update(dt);
    this.controller.update(dt);
    this.controller.apply(this.camera);

    const tier = this.autoTier;
    const steps = tier ? tier.steps : stepsFor(s.quality);
    this.scene.render({
      renderer: this.renderer,
      target: this.display.sceneTarget,
      camera: this.camera,
      settings: s,
      params: sceneParamsStore.getState().values[this.sceneId],
      dt,
      steps,
      frozenTime: this.frozenTime,
    });
    this.drawLabels(s);
    this.display.render(this.renderer, s, timeMs);

    if (this.display.fontReady && !statsStore.getState().ready)
      statsStore.setState({ ready: true });
    this.updateStats(timeMs, steps, tier ? `AUTO·${tier.name}` : s.quality.toUpperCase());
  }

  /**
   * Repaints the text layer: the warp while one runs, otherwise scene labels (ASCII final view
   * only; the layer is left empty otherwise).
   */
  private drawLabels(s: SettingsState): void {
    const text = this.display.text;
    text.clear();
    this.labelHits = [];
    if (!DisplayPipeline.asciiActive(s)) return;
    if (this.warp) {
      this.warp.draw(text);
      return;
    }
    if (!s.labels || !this.scene.labels) return;
    for (const label of this.scene.labels()) {
      const rect = drawLabel(text, label, this.camera, this.tanHalfFov);
      if (rect && label.target) this.labelHits.push({ rect, target: label.target });
    }
  }

  private updateStats(timeMs: number, steps: number, qualityLabel: string): void {
    this.fpsFrames++;
    const elapsed = timeMs - this.fpsWindowStart;
    if (elapsed < STATS_INTERVAL_MS) return;
    statsStore.setState({
      fps: Math.round((this.fpsFrames * 1000) / elapsed),
      sceneRows: this.scene.hudRows(this.camera),
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
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.canvas.removeEventListener('pointerdown', this.onPress);
    this.canvas.removeEventListener('pointermove', this.onHover);
    this.canvas.removeEventListener('click', this.onClick);
    this.unsubscribers.forEach((off) => off());
    this.input.dispose();
    this.scene.dispose();
    this.display.dispose();
    // Deliberately NOT calling forceContextLoss(): React StrictMode remounts on the same canvas,
    // and getContext() would hand the new renderer the lost context.
    this.renderer.dispose();
  }
}
