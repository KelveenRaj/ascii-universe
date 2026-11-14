import * as THREE from 'three';
import fullscreenVert from '@/shaders/fullscreen.vert';

/** One clip-space triangle that covers the whole viewport (cheaper than a quad: no diagonal seam). */
function createFullscreenTriangle(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  return geometry;
}

/** Shared by every pass: the vertex shader ignores it, but three.js needs a camera to render. */
const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/**
 * A full-screen shader pass. Uses RawShaderMaterial (GLSL ES 3.0) so each shader declares exactly
 * what it uses; three.js only prepends `#version 300 es`.
 */
export class FullscreenPass<U extends Record<string, THREE.IUniform>> {
  readonly uniforms: U;
  readonly material: THREE.RawShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly mesh: THREE.Mesh;

  constructor(fragmentShader: string, uniforms: U, vertexShader: string = fullscreenVert) {
    this.uniforms = uniforms;
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(createFullscreenTriangle(), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** Renders into `target`, or to the canvas when `target` is null. */
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, passCamera);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
