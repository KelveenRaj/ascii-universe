import type * as THREE from 'three';
import type { CameraView } from '@/engine/camera/CameraController';
import type { TextLayer } from '@/engine/display/TextLayer';

/**
 * The contract for a minigame. Games run inside the Engine, on top of a scene: the scene keeps
 * rendering as the backdrop, the game draws its sprites and text into the TextLayer, and the
 * React overlay shows what `hud()` returns. While a game runs, camera controls are off and the
 * game gets the input instead (keys, plus on-screen buttons for touch).
 */

/**
 * Abstract inputs, so keys and on-screen buttons are the same thing to a game. Keys: arrows for the
 * directions, W / S for faster / slower, Space or Enter to fire, F to change the view.
 */
export type GameAction = 'left' | 'right' | 'up' | 'down' | 'faster' | 'slower' | 'fire' | 'view';

export interface GameInputFrame {
  /** Held down right now (keys only; buttons are taps). */
  held(action: GameAction): boolean;
  /** Pressed since the last frame (key press or button tap). */
  pressed(action: GameAction): boolean;
}

/** The camera the game is seen through this frame. */
export interface GameView {
  camera: THREE.PerspectiveCamera;
  tanHalfFov: number;
  /** Width / height of the view. */
  aspect: number;
}

export interface GameHud {
  /** Readout rows, e.g. [['SPEED', '0.40 c']]. */
  rows: Array<[string, string]>;
  /** A centred message box (title screen, round result), or null. */
  message: { title: string; lines: string[] } | null;
  /** One line of control hints. */
  hint: string;
}

/**
 * Who drives the camera this frame:
 * - `locked`: it stays on the game's start view.
 * - `orbit`: the player orbits and zooms it with the mouse or touch (keys stay with the game);
 *   `reset` eases it back to the start view first.
 * - `fixed`: the game places it, looking from `position` at `target`.
 */
export type GameCamera =
  | { mode: 'locked' }
  | { mode: 'orbit'; reset?: boolean }
  | { mode: 'fixed'; position: THREE.Vector3; target: THREE.Vector3; up?: THREE.Vector3 };

/** What a game gets from the host. */
export interface GameContext {
  /** Best score so far (saved in the browser). */
  best: number;
  /** Report a finished round's score; it is kept if it beats the best. */
  submitScore: (score: number) => void;
}

export interface GameInstance {
  update(dt: number, input: GameInputFrame, view: GameView): void;
  /** Who drives the camera this frame (asked after `update`). Default: locked. */
  camera?(): GameCamera;
  /** Draw into the (already cleared) text layer. */
  draw(text: TextLayer, view: GameView): void;
  hud(): GameHud;
  dispose(): void;
}

export interface GameModule {
  /** Stable id, used in the URL: #/<body>/game/<id>. */
  id: string;
  title: string;
  /** One line for menus. */
  blurb: string;
  /** The body (and so the scene) the game is played at. */
  bodyId: string;
  /** Where the camera starts (in that scene's units), looking at the origin. */
  startView: CameraView;
  create(ctx: GameContext): GameInstance;
}
