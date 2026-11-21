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
import { drawLabel, type DrawView, type LabelRect } from '@/engine/display/labels';
import { QualityGovernor } from '@/engine/quality/QualityGovernor';
import type { SceneInstance, SceneModule } from '@/engine/scene/SceneModule';
import { Warp } from '@/engine/transition/Warp';
import {
  activeBody,
  activeScene,
  formatHash,
  formatView,
  navigationStore,
  parseView,
} from '@/state/navigation';
import { sceneParamsStore } from '@/state/sceneParams';
import { worldStore } from '@/state/world';
import { ShipPass } from '@/world/ship/ShipPass';
import { WorldHost } from '@/world/WorldHost';

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
 * that has a `target` moves there. In exploration mode (WorldHost) you fly your ship instead: it
 * takes the input and places the camera behind you.
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
  private readonly world: WorldHost;
  /** Your ship's mesh, drawn into the scene buffer over the open world's scenes. */
  private readonly shipPass = new ShipPass();
  private readonly drawView: DrawView;
  /** Save the next finished frame as a PNG. */
  private captureImage = false;
  /** The body the camera was last sent to inside a scene with several (SceneInstance.focus). */
  private focusId: string | null = null;
  private readonly focusAt = new THREE.Vector3();
  private readonly focusDelta = new THREE.Vector3();

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

    // before the first scene is picked: a dev start may put the world's flight somewhere else
    this.world = new WorldHost(canvas);
    const settings = settingsStore.getState();
    const module = activeScene();
    this.sceneId = module.id;
    this.display = new DisplayPipeline(settings, module);

    const tanHalfFov = Math.tan((FOV_DEG * Math.PI) / 360);
    this.tanHalfFov = tanHalfFov;
    this.scene = module.create({ tanHalfFov });
    this.controller = new CameraController(tanHalfFov, module.camera);
    this.controller.attractEnabled = settings.attractMode;
    this.followFocus(true);
    this.applySharedView();
    this.input = new InputManager(canvas, this.controller);
    this.drawView = { camera: this.camera, tanHalfFov, aspect: 16 / 9 };

    // Settings that need resources rebuilt are handled once on change, not checked every frame.
    this.unsubscribers.push(settingsStore.subscribe((s, prev) => this.onSettingsChange(s, prev)));
    this.unsubscribers.push(
      onCommand((cmd) => {
        if (cmd.type === 'preset') this.controller.setPreset(cmd.preset);
        else if (cmd.type === 'resetView') this.controller.reset();
        // a scene that follows bodies goes back to the body's own view instead of the origin
        if (cmd.type === 'preset' || cmd.type === 'resetView') this.focusId = null;
        else if (cmd.type === 'captureText') this.captureText();
        else if (cmd.type === 'captureImage') this.captureImage = true;
        else if (cmd.type === 'copyLink') this.copyLink();
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

  /** A shared link's `?v=yaw,elevation,distance`, within the scene's camera limits. */
  private applySharedView(): void {
    const view = parseView(window.location.hash);
    if (!view || navigationStore.getState().world) return;
    const { goal, limits } = this.controller;
    const rad = Math.PI / 180;
    goal.yaw = view.yaw * rad;
    goal.elevation = Math.max(
      -limits.maxElevation,
      Math.min(limits.maxElevation, view.elevation * rad),
    );
    goal.distance = Math.max(limits.minDistance, Math.min(limits.maxDistance, view.distance));
    this.controller.snap();
  }

  private onSettingsChange(s: SettingsState, prev: SettingsState): void {
    const relayout = this.display.onSettingsChange(s, prev);
    if (s.attractMode !== prev.attractMode && !this.world.active) {
      this.controller.attractEnabled = s.attractMode;
    }
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

  // ---- open world -------------------------------------------------------------------------

  /**
   * Starts or stops flying with the route. The flight keeps going through warps (launching, and
   * moving between its layers); it only moves while its layer's scene is on screen.
   */
  private syncWorld(): void {
    const wanted = navigationStore.getState().world;
    if (wanted === this.world.active) return;
    this.world.sync(wanted);
    if (wanted) {
      this.input.setMode('none');
      this.controller.attractEnabled = false;
    } else {
      this.input.setMode('all');
      this.controller.attractEnabled = settingsStore.getState().attractMode;
    }
  }

  /** Puts the camera where the flight's chase camera wants it. */
  private applyWorldCamera(): void {
    const pose = this.world.camera();
    if (!pose) return;
    this.camera.position.copy(pose.position);
    this.camera.up.copy(pose.up);
    this.camera.lookAt(pose.target);
    this.camera.updateMatrixWorld(true);
  }

  // ---- scene switching ----------------------------------------------------------------------

  /** Starts a warp when navigation has moved to a body rendered by another scene. */
  private checkNavigation(): void {
    if (this.warp) return;
    const module = activeScene();
    if (module.id === this.sceneId) return;
    const body = activeBody();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const label = navigationStore.getState().world
      ? (worldStore.getState().warpLabel ?? 'LAUNCH > OPEN SPACE')
      : `WARP > ${body.designation ?? body.name.toUpperCase()}`;
    this.warp = new Warp(label, reduced);
  }

  /** Swaps the running scene for `module` (at a warp's midpoint, while the screen is dark). */
  private switchScene(module: SceneModule): void {
    this.scene.dispose();
    this.sceneId = module.id;
    this.display.setScene(module, settingsStore.getState());
    this.scene = module.create({ tanHalfFov: this.tanHalfFov });
    this.controller.setSetup(module.camera, ARRIVE_FROM);
    this.focusId = null;
    if (this.followFocus(true)) {
      this.controller.current.distance = this.controller.goal.distance * ARRIVE_FROM;
    }
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

  /**
   * In a scene with several bodies (the Solar System): sends the camera to the body navigation
   * points at when that changes, and keeps it riding along with the body as it moves. Returns
   * whether the scene does this.
   */
  private followFocus(instant: boolean): boolean {
    if (!this.scene.focus) return false;
    const bodyId = navigationStore.getState().bodyId;
    const params = sceneParamsStore.getState().values[this.sceneId];
    const focus = this.scene.focus(bodyId, params);
    if (!focus) return false;
    if (bodyId !== this.focusId) {
      this.focusId = bodyId;
      this.controller.focusOn(focus.target, focus.view, focus.minDistance, instant);
    } else {
      this.controller.follow(this.focusDelta.subVectors(focus.target, this.focusAt));
    }
    this.focusAt.copy(focus.target);
    return true;
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

  /** The last frame as a PNG download. Called right after drawing, while the buffer still holds it. */
  private saveImage(): void {
    this.captureImage = false;
    const name = navigationStore.getState().world ? 'flight' : navigationStore.getState().bodyId;
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ascii-universe-${name}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      uiStore.getState().notify('IMAGE SAVED');
    }, 'image/png');
  }

  /** A link to this body, seen from the camera's current angle (infographics mode only). */
  private copyLink(): void {
    const nav = navigationStore.getState();
    const base = `${window.location.origin}${window.location.pathname}`;
    let hash = formatHash(nav);
    if (!nav.world) {
      const g = this.controller.goal;
      const deg = 180 / Math.PI;
      hash += `?${formatView({ yaw: g.yaw * deg, elevation: g.elevation * deg, distance: g.distance })}`;
    }
    const url = `${base}${hash}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => uiStore.getState().notify('LINK COPIED'))
      .catch(() => uiStore.getState().notify(url));
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
    this.syncWorld();
    this.input.update(dt);
    this.controller.update(dt);
    const grid = this.display.currentGrid;
    this.drawView.aspect = grid ? grid.cols / grid.rows : this.drawSize.x / this.drawSize.y;
    if (this.world.active) {
      // frozen while warping; until the flight's scene is on screen (the first half of a warp),
      // the camera holds still too
      const onScreen = this.world.sceneId === this.sceneId;
      this.world.update(
        dt,
        s.paused || this.frozenTime !== null || this.warp !== null,
        this.drawView,
      );
      if (onScreen) this.applyWorldCamera();
    } else {
      this.followFocus(false);
      this.controller.apply(this.camera);
    }

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
      world: this.world.sceneFrame(this.sceneId),
    });
    this.renderShip();
    this.drawLabels(s);
    this.display.render(this.renderer, s, timeMs);
    if (this.captureImage) this.saveImage();

    if (this.display.fontReady && !statsStore.getState().ready)
      statsStore.setState({ ready: true });
    this.updateStats(timeMs, steps, tier ? `AUTO·${tier.name}` : s.quality.toUpperCase());
  }

  /** Your ship, over the scene it flies in (not while the previous layer's scene is still up). */
  private renderShip(): void {
    if (!this.world.active || this.world.sceneId !== this.sceneId) return;
    const view = this.world.shipView();
    if (!view) return;
    this.shipPass.render(
      this.renderer,
      this.display.sceneTarget,
      this.camera,
      this.tanHalfFov,
      this.display,
      view,
    );
  }

  /**
   * Repaints the text layer: the warp while one runs, else your ship in exploration mode, else
   * scene labels (ASCII final view only; the layer is left empty otherwise).
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
    if (this.world.active) {
      this.world.draw(text, this.drawView);
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
    this.world.dispose();
    this.shipPass.dispose();
    this.input.dispose();
    this.scene.dispose();
    this.display.dispose();
    // Deliberately NOT calling forceContextLoss(): React StrictMode remounts on the same canvas,
    // and getContext() would hand the new renderer the lost context.
    this.renderer.dispose();
  }
}
