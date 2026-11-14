import type * as THREE from 'three';
import type { CameraSetup } from '@/engine/camera/CameraController';
import type { SceneLayout } from '@/engine/display/DisplayPipeline';
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
 *   R = brightness (HDR, linear) → picks the glyph and palette colour
 *   G = star brightness for sky cells, or −1 for pure-black "void" cells (e.g. a shadow)
 *   B = scene-specific value shown by the "redshift" debug view
 *   A = fraction of the quality budget used, shown by the "steps" debug view
 * (M4 in docs/restructure-plan.md generalises this with a per-cell material/palette row.)
 */
export interface SceneModule<S extends ParamSchema = ParamSchema> {
  /** Stable id, used in URLs and saved state. */
  id: string;
  /** Display name, e.g. "Sagittarius A*". Also the scene's settings-panel section title. */
  title: string;
  /** Views, limits and units for the orbit camera. */
  camera: CameraSetup;
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
}

export interface SceneInstance<P = Record<string, ParamValue>> {
  /** Called whenever the display re-lays out the scene buffer (resize, grid change…). */
  setLayout(layout: SceneLayout): void;
  render(frame: SceneFrame<P>): void;
  /** Scene-specific HUD rows after FPS, e.g. [['DIST', '26.0 Rs'], ['INCL', '80°']]. */
  hudRows(camera: THREE.PerspectiveCamera): Array<[string, string]>;
  dispose(): void;
}
