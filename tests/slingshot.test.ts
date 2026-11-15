import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GameAction, GameInputFrame, GameView } from '@/engine/game/Game';
import { findGame, gamesAt } from '@/games/registry';
import {
  DISK_INNER,
  DISK_OUTER,
  diskDamage,
  scoreRound,
  simRate,
  SIM_RATE,
  Slingshot,
} from '@/games/slingshot/Slingshot';
import { shipPose } from '@/world/ship/sprite';
import { highScoreStore } from '@/state/game';

/** Roughly the start view. */
function makeView(): GameView {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  camera.position.set(-17, 16, 37);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { camera, tanHalfFov: Math.tan((25 * Math.PI) / 180), aspect: 16 / 9 };
}

/** Input that presses the given actions for one frame. */
const press = (...actions: GameAction[]): GameInputFrame => ({
  held: () => false,
  pressed: (a) => actions.includes(a),
});
/** Input that holds the given actions down. */
const hold = (...actions: GameAction[]): GameInputFrame => ({
  held: (a) => actions.includes(a),
  pressed: () => false,
});
const idle = press();

function play(game: Slingshot, view: GameView, input = idle, maxFrames = 20_000) {
  for (let i = 0; i < maxFrames && game.currentPhase === 'flight'; i++) {
    game.update(1 / 30, input, view);
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

const row = (game: Slingshot, key: string) => game.hud().rows.find(([k]) => k === key)![1];

describe('scoring and hazards', () => {
  it('scores bending and lost time, scaled by the hull, plus unused fuel', () => {
    expect(scoreRound('escaped', 90, 120)).toBe(1020);
    expect(scoreRound('escaped', 90, 120, 0.5)).toBe(510);
    expect(scoreRound('orbit', 10, 0, 1, 1)).toBe(300);
    expect(scoreRound('horizon', 300, 9999, 1, 1)).toBe(0);
    expect(scoreRound('destroyed', 300, 9999, 1, 1)).toBe(0);
  });

  it('the disk hurts more the closer in, and not at all outside it or in the gap', () => {
    expect(diskDamage(DISK_OUTER + 1)).toBe(0);
    expect(diskDamage(DISK_INNER - 0.5)).toBe(0);
    expect(diskDamage(DISK_OUTER)).toBeCloseTo(0.2);
    expect(diskDamage(DISK_INNER)).toBeCloseTo(1);
    expect(diskDamage(5)).toBeGreaterThan(diskDamage(9));
  });

  it('time runs slower close to the hole', () => {
    expect(simRate(30)).toBe(SIM_RATE);
    expect(simRate(3)).toBeLessThan(simRate(8));
    expect(simRate(1.1)).toBeGreaterThan(0);
  });
});

describe('Slingshot', () => {
  it('starts on the aim screen with the intro, the camera free to look around', () => {
    const { game } = newGame();
    game.update(1 / 30, idle, makeView());
    const hud = game.hud();
    expect(game.currentPhase).toBe('aim');
    expect(hud.message?.title).toBe('SLINGSHOT');
    expect(hud.rows.map(([k]) => k)).toEqual(['TURN', 'TILT', 'SPEED', 'BEST']);
    expect(game.camera().mode).toBe('orbit');
  });

  it('the default shot swings round the hole, clear of the disk, and escapes', () => {
    const { game, submitted } = newGame();
    const view = makeView();
    game.update(1 / 30, press('fire'), view);
    expect(game.currentPhase).toBe('flight');
    game.update(1 / 30, idle, view);
    expect(game.camera().mode).toBe('fixed'); // the chase camera
    play(game, view);
    const r = game.lastResult!;
    expect(r.outcome).toBe('escaped');
    expect(r.bentDeg).toBeGreaterThan(90);
    expect(r.hull).toBe(1);
    expect(r.fuel).toBe(1);
    expect(r.score).toBe(scoreRound(r.outcome, r.bentDeg, r.lostSeconds, r.hull, r.fuel));
    expect(submitted).toEqual([r.score]);
    expect(game.hud().message?.title).toBe('SLINGSHOT!');
    expect(game.hud().message?.lines.at(-1)).toContain('NEW BEST');
  });

  it('a slow ship aimed straight in is lost and scores nothing', () => {
    const { game, submitted } = newGame();
    const view = makeView();
    // the default aim is 0.22 rad off to the side and 0.12 up: undo it in 1° taps
    for (let i = 0; i < 13; i++) game.update(0, press('right'), view);
    for (let i = 0; i < 7; i++) game.update(0, press('down'), view);
    for (let i = 0; i < 40; i++) game.update(0, press('slower'), view);
    game.update(0, press('fire'), view);
    play(game, view);
    expect(['horizon', 'destroyed']).toContain(game.lastResult?.outcome);
    expect(game.lastResult?.score).toBe(0);
    expect(submitted).toEqual([]);
  });

  it('a shot that dives through the disk close in burns up', () => {
    const { game } = newGame();
    const view = makeView();
    for (let i = 0; i < 18; i++) game.update(0, press('down'), view); // tilt about −0.2
    game.update(0, press('fire'), view);
    play(game, view);
    expect(game.lastResult?.outcome).toBe('destroyed');
    expect(game.lastResult?.hull).toBe(0);
    expect(game.hud().message?.title).toBe('BURNED UP IN THE DISK');
  });

  it('burns use fuel, and run out', () => {
    const { game } = newGame();
    const view = makeView();
    game.update(1 / 30, press('fire'), view);
    for (let i = 0; i < 10; i++) game.update(1 / 30, hold('faster'), view);
    const fuel = Number(row(game, 'FUEL').replace('%', ''));
    expect(fuel).toBeLessThan(100);
    expect(fuel).toBeGreaterThan(0);
    play(game, view, hold('up'));
    expect(game.lastResult!.fuel).toBe(0);
  });

  it('F cycles the flight views; free view hands the camera back to the player', () => {
    const { game } = newGame();
    const view = makeView();
    game.update(1 / 30, press('fire'), view);
    expect(row(game, 'VIEW')).toBe('CHASE');
    game.update(1 / 30, press('view'), view);
    expect(row(game, 'VIEW')).toBe('WIDE');
    expect(game.camera().mode).toBe('fixed');
    game.update(1 / 30, press('view'), view);
    expect(row(game, 'VIEW')).toBe('FREE');
    expect(game.camera().mode).toBe('orbit');
  });

  it('fire after a round goes back to aiming, resetting the view', () => {
    const { game } = newGame();
    const view = makeView();
    game.update(1 / 30, press('fire'), view);
    play(game, view);
    expect(game.currentPhase).toBe('result');
    game.update(1 / 30, press('fire'), view);
    expect(game.currentPhase).toBe('aim');
    expect(game.hud().message).toBeNull();
    expect(game.camera()).toEqual({ mode: 'orbit', reset: true });
    expect(game.camera()).toEqual({ mode: 'orbit' });
  });

  it('speed stays within its limits', () => {
    const { game } = newGame();
    const view = makeView();
    for (let i = 0; i < 200; i++) game.update(0, press('faster'), view);
    expect(row(game, 'SPEED')).toBe('0.90 c');
    for (let i = 0; i < 200; i++) game.update(0, press('slower'), view);
    expect(row(game, 'SPEED')).toBe('0.05 c');
  });
});

describe('ship sprite', () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  it('points the way the ship flies on screen', () => {
    expect(shipPose(new THREE.Vector3(1, 0, 0), camera)).toEqual({ kind: 'side', dir: 0 });
    expect(shipPose(new THREE.Vector3(0, 1, 0), camera)).toEqual({ kind: 'side', dir: 2 });
    expect(shipPose(new THREE.Vector3(-1, -1, 0), camera)).toEqual({ kind: 'side', dir: 5 });
  });

  it('is seen end-on when flying straight away from or towards the camera', () => {
    expect(shipPose(new THREE.Vector3(0, 0, -1), camera)).toEqual({ kind: 'rear' });
    expect(shipPose(new THREE.Vector3(0.1, 0, 1), camera)).toEqual({ kind: 'front' });
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
