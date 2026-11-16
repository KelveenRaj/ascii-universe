import * as THREE from 'three';
import type { DisplayPipeline } from '@/engine/display/DisplayPipeline';
import type { Quat, Vec3d } from '@/world/math';
import { glowRamp, hullRamp, SHIP_GLOW, SHIP_HULL, SHIP_TRIM } from '@/world/ship/colors';
import type { ShipDesign } from '@/world/ship/design';
import { exhaustGeometry, shipModel } from '@/world/ship/model';
import shipFrag from '@/world/ship/shaders/ship.frag';
import shipVert from '@/world/ship/shaders/ship.vert';
import exhaustFrag from '@/world/ship/shaders/exhaust.frag';
import exhaustVert from '@/world/ship/shaders/exhaust.vert';

/** Your ship this frame, as WorldHost sees it. Positions and sizes are in the layer's units. */
export interface ShipView {
  design: ShipDesign;
  /** Ship position minus camera position. */
  rel: Vec3d;
  orient: Quat;
  /** Nose to tail. */
  length: number;
  /** Unit vector from the ship towards its key light (the star, the core, the flow). */
  light: Vec3d;
  /** Engine glow, 0 (idle) … 1 (full throttle) … more while boosting or jumping. */
  glow: number;
  /** Exhaust length, 0 … 1, with speed. */
  exhaust: number;
}

type U<T> = THREE.IUniform<T>;

/** Brightness of the nozzles idling, and what full throttle and boost add (scene HDR units). */
const GLOW_IDLE = 0.5;
const GLOW_THROTTLE = 1.6;
/** Longest exhaust, in ship lengths. */
const EXHAUST_MAX = 1.1;
/** Even a parked ship shows a stub of flame while the engine is lit. */
const EXHAUST_MIN = 0.12;

/**
 * Draws your ship into the scene buffer after the scene has rendered, so the ASCII pass shades it
 * like everything else: R lit brightness, G 0 (no stars through the hull), B the ship's palette
 * rows, A 0. Flat shaded, with a key light towards the scene's light source plus a dim fill and a
 * rim so the outline always reads, and engines that glow with the throttle.
 *
 * Everything is camera-relative and in units of the ship's length: the pass's camera sits at the
 * origin with the scene camera's rotation, and the ship at (ship − camera) / length. That keeps
 * float32 happy even in kly. The scene buffer's depth is cleared first; scenes don't write it, so
 * the ship is only hidden behind bodies by WorldHost's check on the CPU.
 */
export class ShipPass {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.02, 5000);
  private readonly hull: THREE.Mesh;
  private readonly exhaust: THREE.Mesh;
  private readonly hullUniforms: {
    uKey: U<THREE.Vector3>;
    uFill: U<THREE.Vector3>;
    uGlow: U<number>;
    uRows: U<THREE.Vector3>;
  };
  private readonly exhaustUniforms: {
    uLength: U<number>;
    uBright: U<number>;
    uRow: U<number>;
  };
  private readonly hullMaterial: THREE.RawShaderMaterial;
  private readonly exhaustMaterial: THREE.RawShaderMaterial;
  /** Colours already in the palette (hull, glow), so rows are only rewritten on a change. */
  private painted = '';
  private readonly camFwd = new THREE.Vector3();
  private readonly camUp = new THREE.Vector3();

  constructor() {
    this.hullUniforms = {
      uKey: { value: new THREE.Vector3(0, 1, 0) },
      uFill: { value: new THREE.Vector3(0, 1, 0) },
      uGlow: { value: GLOW_IDLE },
      uRows: { value: new THREE.Vector3() },
    };
    this.hullMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: shipVert,
      fragmentShader: shipFrag,
      uniforms: this.hullUniforms,
      side: THREE.DoubleSide,
    });
    this.exhaustUniforms = {
      uLength: { value: 0 },
      uBright: { value: 0 },
      uRow: { value: 0 },
    };
    // glow over whatever is behind it: the brighter of the two wins, and the glow row (the
    // highest-numbered) wins B, so the flame keeps its colour over any scene material
    this.exhaustMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: exhaustVert,
      fragmentShader: exhaustFrag,
      uniforms: this.exhaustUniforms,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.hull = new THREE.Mesh(new THREE.BufferGeometry(), this.hullMaterial);
    this.exhaust = new THREE.Mesh(new THREE.BufferGeometry(), this.exhaustMaterial);
    this.hull.frustumCulled = false;
    this.exhaust.frustumCulled = false;
    this.exhaust.renderOrder = 1;
    this.scene.add(this.hull, this.exhaust);
  }

  render(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    sceneCamera: THREE.Camera,
    tanHalfFov: number,
    display: DisplayPipeline,
    view: ShipView,
  ): void {
    const rows = [SHIP_HULL, SHIP_TRIM, SHIP_GLOW].map((id) => display.materialRow(id));
    if (rows.some((r) => r < 0)) return; // a scene without the ship's colours (mid-warp)
    this.paint(display, view.design);

    const model = shipModel(view.design);
    this.hull.geometry = model.geometry;
    this.exhaust.geometry = exhaustGeometry(model);

    // camera at the origin, turned like the scene's; units of one ship length
    const cam = this.camera;
    cam.fov = (2 * Math.atan(tanHalfFov) * 180) / Math.PI;
    cam.aspect = target.width / Math.max(1, target.height);
    cam.position.set(0, 0, 0);
    sceneCamera.getWorldQuaternion(cam.quaternion);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    const k = 1 / view.length;
    for (const mesh of [this.hull, this.exhaust]) {
      mesh.position.set(view.rel[0] * k, view.rel[1] * k, view.rel[2] * k);
      mesh.quaternion.set(view.orient[0], view.orient[1], view.orient[2], view.orient[3]);
      mesh.updateMatrixWorld(true);
    }

    const u = this.hullUniforms;
    u.uKey.value.set(view.light[0], view.light[1], view.light[2]).normalize();
    // fill from over the viewer's shoulder, so the side you see is never black
    cam.getWorldDirection(this.camFwd);
    this.camUp.set(0, 1, 0).applyQuaternion(cam.quaternion);
    u.uFill.value.copy(this.camUp).multiplyScalar(0.6).addScaledVector(this.camFwd, -1).normalize();
    u.uGlow.value = GLOW_IDLE + GLOW_THROTTLE * view.glow;
    u.uRows.value.set(rows[0], rows[1], rows[2]);

    const e = this.exhaustUniforms;
    e.uLength.value = EXHAUST_MIN + (EXHAUST_MAX - EXHAUST_MIN) * view.exhaust;
    e.uBright.value = (GLOW_IDLE + GLOW_THROTTLE * view.glow) * 0.9;
    e.uRow.value = rows[2];
    this.exhaust.visible = view.glow > 0.02 || view.exhaust > 0.02;

    renderer.setRenderTarget(target);
    renderer.clearDepth();
    renderer.render(this.scene, cam);
  }

  /** Puts the design's colours into the palette rows, when they've changed. */
  private paint(display: DisplayPipeline, design: ShipDesign): void {
    const key = `${design.color}/${design.trail.color}`;
    if (key === this.painted) return;
    this.painted = key;
    display.setMaterialRamp(SHIP_HULL, hullRamp(design.color));
    display.setMaterialRamp(SHIP_GLOW, glowRamp(design.trail.color));
  }

  dispose(): void {
    this.hullMaterial.dispose();
    this.exhaustMaterial.dispose();
    // geometries are cached per design in model.ts and live as long as the page
  }
}
