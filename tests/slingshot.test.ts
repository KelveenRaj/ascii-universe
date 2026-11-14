import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GameAction, GameInputFrame, GameView } from '@/engine/game/Game';
import { findGame, gamesAt } from '@/games/registry';
import { scoreRound, Slingshot } from '@/games/slingshot/Slingshot';
import { highScoreStore } from '@/state/game';

/** The edge-on preset: 26 r_s out, 10° up. */
function makeView(): GameView {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  const el = (10 * Math.PI) / 180;
  camera.position.set(0, 26 * Math.sin(el), 26 * Math.cos(el));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { camera, tanHalfFov: Math.tan((25 * Math.PI) / 180), aspect: 16 / 9 };
}

/** Input that presses the given actions for one frame. */
const press = (...actions: GameAction[]): GameInputFrame => ({
  held: () => false,
  pressed: (a) => actions.includes(a),
});
const idle = press();

function play(game: Slingshot, view: GameView, maxFrames = 20_000) {
  for (let i = 0; i < maxFrames && game.currentPhase === 'flight'; i++) {
    game.update(1 / 30, idle, view);
  }
}

function newGame() {
  const submitted: number[] = [];
  let best = 0;
  const game = new Slingshot({
    get best() {
      return best;
    },
    submitScore: (s) => {
      submitted.push(s);
      best = Math.max(best, s);
    },
  });
  return { game, submitted };
}

describe('scoreRound', () => {
  it('scores bending and lost time, and nothing for falling in', () => {
    expect(scoreRound('escaped', 90, 120)).toBe(1020);
    expect(scoreRound('orbit', 10.04, 0)).toBe(100);
    expect(scoreRound('horizon', 300, 9999)).toBe(0);
    expect(scoreRound('escaped', 5, -10)).toBe(50);
  });
});

describe('Slingshot', () => {
  it('starts on the aim screen with the intro message', () => {
    const { game } = newGame();
    const view = makeView();
    game.update(1 / 30, idle, view);
    const hud = game.hud();
    expect(game.currentPhase).toBe('aim');
    expect(hud.message?.title).toBe('SLINGSHOT');
    expect(hud.rows.map(([k]) => k)).toEqual(['ANGLE', 'SPEED', 'BEST']);
  });

  it('the default shot swings round the hole and escapes with a score', () => {
    const { game, submitted } = newGame();
    const view = makeView();
    game.update(1 / 30, press('fire'), view);
    expect(game.currentPhase).toBe('flight');
    play(game, view);
    const r = game.lastResult!;
    expect(r.outcome).toBe('escaped');
    expect(r.bentDeg).toBeGreaterThan(45);
    expect(r.lostSeconds).toBeGreaterThan(0);
    expect(r.score).toBe(scoreRound(r.outcome, r.bentDeg, r.lostSeconds));
    expect(submitted).toEqual([r.score]);
    expect(game.hud().message?.title).toBe('SLINGSHOT!');
    expect(game.hud().message?.lines.at(-1)).toContain('NEW BEST');
  });

  it('a slow probe aimed straight in is lost and scores nothing', () => {
    const { game, submitted } = newGame();
    const view = makeView();
    game.update(1 / 30, idle, view);
    // the default aim is 0.3 rad off the hole's direction: turn back by 17 taps of 1°
    for (let i = 0; i < 17; i++) game.update(0, press('right'), view);
    for (let i = 0; i < 40; i++) game.update(0, press('down'), view);
    game.update(0, press('fire'), view);
    play(game, view);
    expect(game.lastResult?.outcome).toBe('horizon');
    expect(game.lastResult?.score).toBe(0);
    expect(submitted).toEqual([]);
    expect(game.hud().message?.title).toBe('LOST TO THE HORIZON');
  });

  it('fire after a round goes back to aiming, without the intro', () => {
    const { game } = newGame();
    const view = makeView();
    game.update(1 / 30, press('fire'), view);
    play(game, view);
    expect(game.currentPhase).toBe('result');
    game.update(1 / 30, press('fire'), view);
    expect(game.currentPhase).toBe('aim');
    expect(game.hud().message).toBeNull();
  });

  it('speed stays within its limits', () => {
    const { game } = newGame();
    const view = makeView();
    for (let i = 0; i < 200; i++) game.update(0, press('up'), view);
    expect(game.hud().rows[1][1]).toBe('0.95 c');
    for (let i = 0; i < 200; i++) game.update(0, press('down'), view);
    expect(game.hud().rows[1][1]).toBe('0.05 c');
  });
});

describe('game registry', () => {
  it('finds slingshot at Sgr A* only', () => {
    expect(findGame('slingshot')?.bodyId).toBe('sgr-a-star');
    expect(findGame('__proto__')).toBeUndefined();
    expect(gamesAt('sgr-a-star').map((g) => g.id)).toContain('slingshot');
    expect(gamesAt('milky-way')).toEqual([]);
  });
});

describe('high scores', () => {
  it('keeps only better scores', () => {
    const s = highScoreStore.getState();
    expect(s.submit('test-game', 100)).toBe(true);
    expect(highScoreStore.getState().submit('test-game', 50)).toBe(false);
    expect(highScoreStore.getState().submit('test-game', Number.NaN)).toBe(false);
    expect(highScoreStore.getState().submit('test-game', 120.4)).toBe(true);
    expect(highScoreStore.getState().scores['test-game']).toBe(120);
  });
});
