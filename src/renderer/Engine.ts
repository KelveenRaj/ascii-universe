import * as THREE from 'three';
import { onCommand } from '@/state/commands';
import { AUTO_START_TIER, MAX_PIXEL_RATIO } from '@/state/deviceTier';
import { settingsStore, stepsFor, type SettingsState } from '@/state/settings';
import { statsStore } from '@/state/stats';
import { uiStore } from '@/state/ui';
import { CameraController } from '@/renderer/camera/CameraController';
import { InputManager } from '@/renderer/camera/InputManager';
import { applyDevQueryParams } from '@/renderer/devParams';
import { DisplayPipeline } from '@/renderer/display/DisplayPipeline';
import { ScenePass } from '@/renderer/passes/ScenePass';
import { QualityGovernor } from '@/renderer/QualityGovernor';

const FOV_DEG = 50;
const STATS_INTERVAL_MS = 250;

/**
 * Owns the WebGL renderer and the render loop. Plain TypeScript: React only creates and disposes it
 * (see BlackHoleCanvas), it never drives frames.
 *
 * Each frame: camera → scene pass into the display's scene buffer → DisplayPipeline to the screen.
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
  private readonly scene: ScenePass;

  private disposed = false;
  private contextLost = false;
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

    const settings = settingsStore.getState();
    this.display = new DisplayPipeline(settings);

    const tanHalfFov = Math.tan((FOV_DEG * Math.PI) / 360);
    this.scene = new ScenePass(tanHalfFov);
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

    if (!s.paused) this.diskTime += dt * s.diskSpeed;
    this.input.update(dt);
    this.controller.update(dt);
    this.controller.apply(this.camera);

    const tier = this.autoTier;
    const steps = tier ? tier.steps : stepsFor(s.quality);
    const time = this.frozenTime ?? this.diskTime;
    this.scene.render(this.renderer, this.display.sceneTarget, this.camera, s, time, steps);
    this.display.render(this.renderer, s, timeMs);

    if (this.display.fontReady && !statsStore.getState().ready)
      statsStore.setState({ ready: true });
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
