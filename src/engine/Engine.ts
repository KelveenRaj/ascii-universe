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
import { drawLabel } from '@/engine/display/labels';
import { QualityGovernor } from '@/engine/quality/QualityGovernor';
import type { SceneInstance } from '@/engine/scene/SceneModule';
import { activeScene } from '@/state/navigation';
import { sceneParamsStore } from '@/state/sceneParams';

const FOV_DEG = 50;
const STATS_INTERVAL_MS = 250;

/**
 * Owns the WebGL renderer and the render loop. Plain TypeScript: React only creates and disposes it
 * (see EngineCanvas), it never drives frames.
 *
 * Each frame: camera → active scene renders into the display's scene buffer → DisplayPipeline to
 * the screen. The scene is anything implementing SceneModule (see engine/scene/SceneModule.ts).
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
  private readonly scene: SceneInstance;
  private readonly sceneId: string;
  private readonly tanHalfFov: number;

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

  /** Repaints scene labels into the text layer (ASCII final view only; the layer is cleared otherwise). */
  private drawLabels(s: SettingsState): void {
    const text = this.display.text;
    text.clear();
    if (!s.labels || !DisplayPipeline.asciiActive(s) || !this.scene.labels) return;
    for (const label of this.scene.labels()) {
      drawLabel(text, label, this.camera, this.tanHalfFov);
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
    this.unsubscribers.forEach((off) => off());
    this.input.dispose();
    this.scene.dispose();
    this.display.dispose();
    // Deliberately NOT calling forceContextLoss(): React StrictMode remounts on the same canvas,
    // and getContext() would hand the new renderer the lost context.
    this.renderer.dispose();
  }
}
