import * as THREE from 'three';
import placeholderFrag from '../shaders/placeholder.frag';
import { FullscreenPass } from './FullscreenPass';

const MAX_PIXEL_RATIO = 2;

/**
 * Owns the WebGL renderer, the pass graph and the render loop. Plain TypeScript: React only creates
 * and disposes it (see BlackHoleCanvas), it never drives frames.
 */
export class Engine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly placeholder: FullscreenPass<{
    uResolution: THREE.IUniform<THREE.Vector2>;
    uTime: THREE.IUniform<number>;
  }>;
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly canvas: HTMLCanvasElement;
  private disposed = false;

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

    this.placeholder = new FullscreenPass(placeholderFrag, {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false); // CSS owns the element size
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.placeholder.uniforms.uResolution.value.copy(this.drawingBufferSize);
  }

  private frame(timeMs: number): void {
    this.placeholder.uniforms.uTime.value = timeMs / 1000;
    this.placeholder.render(this.renderer, null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.placeholder.dispose();
    // Deliberately NOT calling forceContextLoss(): React StrictMode remounts on the same canvas,
    // and getContext() would hand the new renderer the lost context.
    this.renderer.dispose();
  }
}
