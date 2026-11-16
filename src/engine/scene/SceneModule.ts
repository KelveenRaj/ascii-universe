import type * as THREE from 'three';
import type { CameraSetup, CameraView } from '@/engine/camera/CameraController';
import type { SceneLayout } from '@/engine/display/DisplayPipeline';
import type { SceneLabel } from '@/engine/display/labels';
import type { Material, Sky } from '@/engine/display/palette/palettes';
import type { ParamSchema, ParamValue, ParamValues } from '@/engine/scene/params';
import type { SettingsState } from '@/state/settings';

/**
 * The contract between the engine and a place you can visit (black hole, galaxy, star, planet…).
 *
 * The engine owns the renderer, camera, input, quality and the whole ASCII display; a scene only
 * has to fill the display's scene buffer each frame. Everything after that (glyphs, palette,
 * bloom, CRT, copy as text) comes for free.
 *
 * Scene buffer layout (half-float RGBA, one texel per character cell, or 2×2 when supersampled):
 *   R = brightness (HDR, linear) → picks the glyph, and the colour along the material's ramp
 *   G = star brightness for sky cells, or −1 for pure-black "void" cells (e.g. a shadow)
 *   B = material: index into this scene's `materials` (a whole number; read per texel, never
 *       blended, so neighbouring materials don't mix)
 *   A = value for the active debug view (settings.debugView):
 *         'redshift' → the scene's shift factor g (1 = none, > 1 blueshift, < 1 redshift, 0 = n/a)
 *         otherwise  → fraction of the quality budget used (shown by 'steps')
 */
export interface SceneModule<S extends ParamSchema = ParamSchema> {
  /** Stable id, used in URLs and saved state. */
  id: string;
  /** Display name, e.g. "Sagittarius A*". Also the scene's settings-panel section title. */
  title: string;
  /** Views, limits and units for the orbit camera. */
  camera: CameraSetup;
  /**
   * What the scene paints with, at least one. Index i is the value written to B. Under natural
   * colours each uses its own ramp; terminal palettes recolour them all.
   */
  materials: readonly Material[];
  /** Star tint and empty-sky colour under natural colours. */
  sky: Sky;
  /** The scene's knobs: defaults, validation, saved per scene, shown in the settings panel. */
  params: S;
  create(ctx: SceneContext): SceneInstance<ParamValues<S>>;
}

export interface SceneContext {
  /** tan(vertical FOV / 2) of the engine camera, for building view rays. */
  tanHalfFov: number;
}

export interface SceneFrame<P = Record<string, ParamValue>> {
  renderer: THREE.WebGLRenderer;
  /** The display's scene buffer. Render into this. */
  target: THREE.WebGLRenderTarget;
  /** Position and orientation are current; use matrixWorld for the view basis. */
  camera: THREE.PerspectiveCamera;
  /** Global settings (display, quality, pause…). */
  settings: SettingsState;
  /** This scene's own params, already validated. */
  params: P;
  /** Real seconds since the last frame (capped at 0.1). */
  dt: number;
  /** Quality budget for this frame: ray-march steps for ray-traced scenes. */
  steps: number;
  /** Dev only: hold the scene's animation clock at this value, for reproducible screenshots. */
  frozenTime: number | null;
  /** In the open world: what the flight wants drawn besides the scene itself (nearby stars). */
  world?: WorldFrame;
}

/** A star near the ship, for an open-world layer to draw. */
export interface NearStar {
  /** Position relative to the camera, in the scene's units (small, so float32 keeps it exact). */
  rel: readonly [number, number, number];
  /** How bright it looks (scene brightness units). */
  brightness: number;
  /** Index into the scene's materials. */
  material: number;
  /** Size of its core, in sky pixels. */
  size: number;
}

/** A sphere for a star-system layer to draw, relative to the camera. */
export interface SystemBody {
  rel: readonly [number, number, number];
  radius: number;
  material: number;
  /** Varies the surface pattern, 0…1. */
  seed: number;
  /** Ring plane normal and outer radius, if it has rings. */
  ring?: { normal: readonly [number, number, number]; outer: number };
}

export interface WorldFrame {
  /** Point stars (the galaxy layer). */
  stars: readonly NearStar[];
  /** The star and planets (a system layer). */
  system?: { star: SystemBody; planets: readonly SystemBody[] };
}

/** Where the camera should be for a body inside a scene with several (see SceneInstance.focus). */
export interface SceneFocus {
  /** The body's position now, in scene units. The camera keeps following it. */
  target: THREE.Vector3;
  /** The view to ease to when you go to it (angles in degrees, around the target). */
  view: CameraView;
  /** Closest the camera may come to the target. */
  minDistance: number;
}

export interface SceneInstance<P = Record<string, ParamValue>> {
  /** Called whenever the display re-lays out the scene buffer (resize, grid change…). */
  setLayout(layout: SceneLayout): void;
  /**
   * For scenes holding several bodies you can go to (the Solar System): where the camera goes for
   * `bodyId`, or null if the scene doesn't do this. Asked every frame before render(), for the
   * same moment render() then draws, so a fast-moving body stays put on screen.
   */
  focus?(bodyId: string, params: P): SceneFocus | null;
  render(frame: SceneFrame<P>): void;
  /** Name tags drawn in the character grid (ASCII mode, when labels are on). */
  labels?(): SceneLabel[];
  /** Scene-specific HUD rows after FPS, e.g. [['DIST', '26.0 Rs'], ['INCL', '80°']]. */
  hudRows(camera: THREE.PerspectiveCamera): Array<[string, string]>;
  dispose(): void;
}
