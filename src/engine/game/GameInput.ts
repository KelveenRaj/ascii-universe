import { isTypingTarget } from '@/engine/camera/InputManager';
import type { GameAction, GameInputFrame } from '@/engine/game/Game';

const KEY_ACTIONS: Record<string, GameAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyW: 'faster',
  KeyS: 'slower',
  Space: 'fire',
  Enter: 'fire',
  KeyF: 'view',
};

/**
 * Keyboard → game actions, plus taps from on-screen buttons (`tap`). Only listens while enabled,
 * i.e. while a game is running. `frame()` hands the game this frame's input; call `endFrame()`
 * after the game has updated.
 */
export class GameInput implements GameInputFrame {
  private readonly heldActions = new Set<GameAction>();
  private readonly pressedActions = new Set<GameAction>();
  private enabled = false;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.heldActions.clear();
    this.pressedActions.clear();
  }

  /** An on-screen button press. */
  tap(action: GameAction): void {
    if (this.enabled) this.pressedActions.add(action);
  }

  held(action: GameAction): boolean {
    return this.heldActions.has(action);
  }

  pressed(action: GameAction): boolean {
    return this.pressedActions.has(action);
  }

  endFrame(): void {
    this.pressedActions.clear();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    const action = KEY_ACTIONS[e.code];
    if (!action) return;
    e.preventDefault();
    this.heldActions.add(action);
    if (!e.repeat) this.pressedActions.add(action);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const action = KEY_ACTIONS[e.code];
    if (action) this.heldActions.delete(action);
  };

  private onBlur = () => this.heldActions.clear();

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
