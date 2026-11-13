import * as THREE from 'three';
import blackholeFrag from '../shaders/blackhole.frag';
import presentFrag from '../shaders/present.frag';
import { DEBUG_VIEWS, settingsStore, type DebugView } from '../state/settings';
import { statsStore } from '../state/stats';
import { TempOrbit, VIEW_PRESETS } from './camera/TempOrbit';
import { FullscreenPass } from './FullscreenPass';
import { createLutTexture, hexToRgb, updateLutTexture } from './palette/lut';
import { PALETTES } from './palette/palettes';

const MAX_PIXEL_RATIO = 2;
const FOV_DEG = 50;
/** M1 renders the scene at a reduced resolution and upscales; M2 switches to one texel per glyph. */
const SCENE_SCALE = 0.6;
const SCENE_MAX_HEIGHT = 600;
const STATS_INTERVAL_MS = 250;

type U<T> = THREE.IUniform<T>;

/**
 * Owns the WebGL renderer, the pass graph and the render loop. Plain TypeScript: React only creates
 * and disposes it (see BlackHoleCanvas), it never drives frames.
 */
export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 1000);
  private readonly orbit: TempOrbit;
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly lut: THREE.DataTexture;
  private readonly unsubscribers: Array<() => void> = [];

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

    this.presentPass = new FullscreenPass(presentFrag, {
      uScene: { value: this.sceneTarget.texture },
      uLut: { value: this.lut },
      uStarTint: { value: new THREE.Vector3(...hexToRgb(palette.starTint)) },
      uBackground: { value: new THREE.Vector3(...hexToRgb(palette.background)) },
      uExposure: { value: settings.exposure },
      uDebugView: { value: 0 },
    });

    // Palette changes rebuild the LUT once, instead of being checked every frame.
    this.unsubscribers.push(
      settingsStore.subscribe((state, prev) => {
        if (state.palette !== prev.palette) this.applyPalette();
      }),
    );

    this.orbit = new TempOrbit(canvas);
    window.addEventListener('keydown', this.onKey);
    if (import.meta.env.DEV) this.applyDevQueryParams();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private applyPalette(): void {
    const palette = PALETTES[settingsStore.getState().palette];
    updateLutTexture(this.lut, palette);
    this.presentPass.uniforms.uStarTint.value.set(...hexToRgb(palette.starTint));
    this.presentPass.uniforms.uBackground.value.set(...hexToRgb(palette.background));
  }

  /** e.g. ?preset=eht&view=redshift&dist=20&t=12 — handy for screenshots while developing. */
  private applyDevQueryParams(): void {
    const q = new URLSearchParams(window.location.search);
    const preset = q.get('preset');
    if (preset && preset in VIEW_PRESETS) this.orbit.setPreset(preset as keyof typeof VIEW_PRESETS);
    const view = q.get('view');
    if (view && (DEBUG_VIEWS as readonly string[]).includes(view)) {
      settingsStore.getState().set('debugView', view as DebugView);
    }
    const dist = Number(q.get('dist'));
    if (dist > 0) this.orbit.distance = dist;
    const elev = q.get('elev');
    if (elev !== null) this.orbit.elevation = (Number(elev) * Math.PI) / 180;
    const t = q.get('t');
    if (t !== null) this.frozenTime = Number(t);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const s = settingsStore.getState();
    if (e.key === 'v' || e.key === 'V') s.cycleDebugView();
    else if (e.key === ' ') {
      e.preventDefault();
      s.togglePaused();
    }
  };

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false); // CSS owns the element size

    const sceneH = Math.max(90, Math.min(SCENE_MAX_HEIGHT, Math.round(height * SCENE_SCALE)));
    const sceneW = Math.max(160, Math.round((sceneH * width) / height));
    this.sceneTarget.setSize(sceneW, sceneH);

    const u = this.scenePass.uniforms;
    u.uAspect.value = width / height;
    u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / sceneH;
    statsStore.setState({ sceneWidth: sceneW, sceneHeight: sceneH });
  }

  private frame(timeMs: number): void {
    const dt = this.lastFrameMs < 0 ? 0 : Math.min((timeMs - this.lastFrameMs) / 1000, 0.1);
    this.lastFrameMs = timeMs;
    const s = settingsStore.getState();

    if (!s.paused) this.diskTime += dt * s.diskSpeed;
    this.orbit.apply(this.camera);

    const u = this.scenePass.uniforms;
    u.uCamPos.value.copy(this.camera.position);
    u.uCamBasis.value.setFromMatrix4(this.camera.matrixWorld);
    u.uTime.value = this.frozenTime ?? this.diskTime;
    u.uMaxSteps.value = s.maxSteps;
    u.uDiskInner.value = s.diskInner;
    u.uDiskOuter.value = s.diskOuter;
    u.uBeaming.value = s.beaming;
    u.uStarDensity.value = s.starDensity;

    const p = this.presentPass.uniforms;
    p.uExposure.value = s.exposure;
    p.uDebugView.value = DEBUG_VIEWS.indexOf(s.debugView);

    this.scenePass.render(this.renderer, this.sceneTarget);
    this.presentPass.render(this.renderer, null);

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
    this.orbit.dispose();
    this.scenePass.dispose();
    this.presentPass.dispose();
    this.sceneTarget.dispose();
    this.lut.dispose();
    // Deliberately NOT calling forceContextLoss(): React StrictMode remounts on the same canvas,
    // and getContext() would hand the new renderer the lost context.
    this.renderer.dispose();
  }
}
