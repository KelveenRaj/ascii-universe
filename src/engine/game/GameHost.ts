import type { TextLayer } from '@/engine/display/TextLayer';
import type { GameInstance, GameModule, GameView } from '@/engine/game/Game';
import { GameInput } from '@/engine/game/GameInput';
import { gameStore, highScoreStore } from '@/state/game';

/**
 * Runs at most one minigame for the Engine: starts and stops it to match navigation, feeds it
 * input, lets it draw, and publishes its HUD for the React overlay (only when it changes).
 */
export class GameHost {
  readonly input = new GameInput();
  private running: { module: GameModule; instance: GameInstance } | null = null;
  private hudJson = '';
  private readonly onStart: (module: GameModule) => void;
  private readonly onStop: () => void;

  /** `onStart` / `onStop` hand the camera and input over to the game and back. */
  constructor(onStart: (module: GameModule) => void, onStop: () => void) {
    this.onStart = onStart;
    this.onStop = onStop;
  }

  get active(): boolean {
    return this.running !== null;
  }

  /** Starts, swaps or stops the game so that `wanted` is the one running. */
  sync(wanted: GameModule | null): void {
    if (this.running?.module === wanted) return;
    if (this.running) {
      this.running.instance.dispose();
      this.running = null;
      this.input.setEnabled(false);
      gameStore.setState({ hud: null });
      this.hudJson = '';
      this.onStop();
    }
    if (!wanted) return;
    const id = wanted.id;
    const instance = wanted.create({
      get best() {
        return highScoreStore.getState().scores[id] ?? 0;
      },
      submitScore: (score) => {
        highScoreStore.getState().submit(id, score);
      },
    });
    this.running = { module: wanted, instance };
    this.input.setEnabled(true);
    this.onStart(wanted);
  }

  update(dt: number, view: GameView): void {
    if (!this.running) return;
    const game = this.running.instance;
    game.update(dt, this.input, view);
    this.input.endFrame();
    const hud = game.hud();
    const json = JSON.stringify(hud);
    if (json !== this.hudJson) {
      this.hudJson = json;
      gameStore.setState({ hud });
    }
  }

  draw(text: TextLayer, view: GameView): void {
    this.running?.instance.draw(text, view);
  }

  dispose(): void {
    this.sync(null);
    this.input.dispose();
  }
}
