import * as THREE from 'three';
import { projectToGrid } from '@/engine/display/labels';
import type { TextLayer, TextStyle } from '@/engine/display/TextLayer';
import type {
  GameContext,
  GameHud,
  GameInputFrame,
  GameInstance,
  GameView,
} from '@/engine/game/Game';
import {
  advance,
  heading,
  launch,
  localSpeed,
  planePosition,
  SGR_A_SECONDS_PER_UNIT,
  type Orbit,
} from '@/scenes/black-hole/orbit';

/** Outside-clock time (r_s/c) that passes per real second of flight. */
export const SIM_RATE = 20;
/** Give up on a probe still going round after this much outside time: it's in orbit. */
export const ORBIT_TIMEOUT = 1500;
const MIN_SPEED = 0.05;
const MAX_SPEED = 0.95;
const ANGLE_RATE = 0.5; // rad/s while held
const SPEED_RATE = 0.2; // c/s while held
const ANGLE_TAP = Math.PI / 180;
const SPEED_TAP = 0.01;
const TRAIL_SPACING = 0.35; // r_s between trail dots
const PREVIEW_TIME = 24; // r_s/c of path shown while aiming (the start of it, not the whole answer)

type Phase = 'aim' | 'flight' | 'result';

export interface RoundResult {
  outcome: 'escaped' | 'horizon' | 'orbit';
  /** How far the path bent, degrees. */
  bentDeg: number;
  /** Closest approach, r_s. */
  minR: number;
  /** Seconds the probe's clock fell behind compared with staying at the launch point's rate. */
  lostSeconds: number;
  score: number;
}

/** Points: 10 per degree of bending plus 1 per second lost. Falling in scores nothing. */
export function scoreRound(outcome: RoundResult['outcome'], bentDeg: number, lostSeconds: number) {
  return outcome === 'horizon' ? 0 : Math.round(bentDeg * 10 + Math.max(0, lostSeconds));
}

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Wraps an angle into (−π, π]. */
const unwrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * Slingshot: fling a probe past Sagittarius A* and bend its path as hard as you dare.
 *
 * The probe moves in the plane through the black hole facing the camera (so the disk arcs behind
 * it), on a real Schwarzschild orbit (see scenes/black-hole/orbit.ts). The closer it skims, the
 * more its path bends and the further its clock falls behind; below the photon sphere (1.5 r_s)
 * there's no coming back.
 */
export class Slingshot implements GameInstance {
  private phase: Phase = 'aim';
  private launched = false;
  private angle = 0;
  private speed = 0.45;
  private start: [number, number] = [-18, 6];
  private aspect = 0;
  private aimSet = false;
  private orbit: Orbit | null = null;
  private trail: Array<[number, number]> = [];
  private preview: Array<[number, number]> = [];
  private previewKey = '';
  private minR = Infinity;
  private bent = 0;
  private lastHeading = 0;
  /** dτ/dt at launch, the baseline for "time lost". */
  private baseRate = 1;
  private escapeR = 30;
  private result: (RoundResult & { newBest: boolean }) | null = null;
  private readonly ctx: GameContext;
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly world = new THREE.Vector3();

  constructor(ctx: GameContext) {
    this.ctx = ctx;
  }

  /** Lays out the start point for the current view shape (kept while flying). */
  private layout(view: GameView): void {
    if (view.aspect === this.aspect) return;
    this.aspect = view.aspect;
    const halfH = view.tanHalfFov * view.camera.position.length();
    const halfW = halfH * view.aspect;
    const x = -Math.min(18, 0.82 * halfW);
    const y = 0.5 * halfH;
    this.start = [x, y];
    this.escapeR = Math.max(1.5 * Math.hypot(x, y), Math.hypot(halfW, halfH) + 4);
    // aim just to one side of the hole by default
    if (!this.aimSet) {
      this.angle = Math.atan2(-y, -x) + 0.3;
      this.aimSet = true;
    }
  }

  private launchOrbit(): Orbit {
    const [x, y] = this.start;
    const phi0 = Math.atan2(y, x);
    return launch(Math.hypot(x, y), phi0, this.speed, this.angle - phi0);
  }

  update(dt: number, input: GameInputFrame, view: GameView): void {
    if (this.phase !== 'flight') this.layout(view);

    if (this.phase === 'aim') {
      const turn =
        (Number(input.held('left')) - Number(input.held('right'))) * ANGLE_RATE * dt +
        (Number(input.pressed('left')) - Number(input.pressed('right'))) * ANGLE_TAP;
      const faster =
        (Number(input.held('up')) - Number(input.held('down'))) * SPEED_RATE * dt +
        (Number(input.pressed('up')) - Number(input.pressed('down'))) * SPEED_TAP;
      this.angle = unwrap(this.angle + turn);
      this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.speed + faster));
      if (input.pressed('fire')) this.fire();
      return;
    }

    if (this.phase === 'result') {
      if (input.pressed('fire')) {
        this.phase = 'aim';
        this.trail = [];
        this.orbit = null;
        this.result = null;
      }
      return;
    }

    this.fly(dt);
  }

  private fire(): void {
    const o = this.launchOrbit();
    this.orbit = o;
    this.phase = 'flight';
    this.launched = true;
    this.trail = [this.start];
    this.minR = o.r;
    this.bent = 0;
    this.lastHeading = heading(o);
    this.baseRate = (1 - 1 / o.r) / o.E;
  }

  private fly(dt: number): void {
    const o = this.orbit!;
    const event = advance(o, dt * SIM_RATE, (s) => {
      this.minR = Math.min(this.minR, s.r);
      const h = heading(s);
      this.bent += unwrap(h - this.lastHeading);
      this.lastHeading = h;
      const p = planePosition(s);
      const last = this.trail[this.trail.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > TRAIL_SPACING) this.trail.push(p);
    });
    if (event === 'horizon') this.finish('horizon');
    else if (o.r > this.escapeR && o.vr > 0) this.finish('escaped');
    else if (o.t > ORBIT_TIMEOUT) this.finish('orbit');
  }

  private finish(outcome: RoundResult['outcome']): void {
    const o = this.orbit!;
    const bentDeg = (Math.abs(this.bent) * 180) / Math.PI;
    const lostSeconds = Math.max(0, (o.t * this.baseRate - o.tau) * SGR_A_SECONDS_PER_UNIT);
    const score = scoreRound(outcome, bentDeg, lostSeconds);
    const before = this.ctx.best;
    if (score > 0) this.ctx.submitScore(score);
    this.result = {
      outcome,
      bentDeg,
      minR: this.minR,
      lostSeconds,
      score,
      newBest: score > before,
    };
    this.phase = 'result';
  }

  /** The last finished round, for tests. */
  get lastResult(): RoundResult | null {
    return this.result;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  // ---- drawing ------------------------------------------------------------------------------

  private updatePreview(): void {
    const key = `${this.angle}|${this.speed}|${this.start}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    const o = this.launchOrbit();
    const points: Array<[number, number]> = [];
    let last = this.start;
    advance(o, PREVIEW_TIME, (s) => {
      const p = planePosition(s);
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.9) {
        points.push(p);
        last = p;
      }
    });
    this.preview = points;
  }

  draw(text: TextLayer, view: GameView): void {
    const m = view.camera.matrixWorld;
    this.right.setFromMatrixColumn(m, 0);
    this.up.setFromMatrixColumn(m, 1);
    const plot = (p: [number, number], ch: string, style: TextStyle) => {
      this.world.copy(this.right).multiplyScalar(p[0]).addScaledVector(this.up, p[1]);
      const cell = projectToGrid(this.world, view.camera, view.tanHalfFov, text.cols, text.rows);
      if (cell) text.put(cell.col, cell.row, ch, style);
    };

    if (this.phase === 'aim') {
      this.updatePreview();
      for (const p of this.preview) plot(p, '.', 'accent');
      plot(this.start, '@', 'bright');
      return;
    }

    const recent = this.trail.length - 30;
    this.trail.forEach((p, i) => plot(p, '.', i < recent ? 'dim' : 'normal'));
    if (this.orbit && this.result?.outcome !== 'horizon')
      plot(planePosition(this.orbit), '@', 'bright');
  }

  // ---- HUD ----------------------------------------------------------------------------------

  hud(): GameHud {
    const best = ['BEST', String(this.ctx.best)] as [string, string];
    if (this.phase === 'aim') {
      return {
        rows: [
          ['ANGLE', `${Math.round((this.angle * 180) / Math.PI)}°`],
          ['SPEED', `${this.speed.toFixed(2)} c`],
          best,
        ],
        message: this.launched
          ? null
          : {
              title: 'SLINGSHOT',
              lines: [
                'Fling a probe past Sgr A*.',
                'Bend its path, and let its clock fall behind.',
                'Skim too close and it never comes back.',
              ],
            },
        hint: '← → AIM · ↑ ↓ SPEED · SPACE LAUNCH · ESC QUIT',
      };
    }

    const o = this.orbit!;
    const rows: Array<[string, string]> = [
      ['SPEED', `${localSpeed(o).toFixed(2)} c`],
      ['DIST', `${o.r.toFixed(1)} Rs`],
      ['OUTSIDE', mmss(o.t * SGR_A_SECONDS_PER_UNIT)],
      ['PROBE', mmss(o.tau * SGR_A_SECONDS_PER_UNIT)],
      ['BENT', `${Math.round((Math.abs(this.bent) * 180) / Math.PI)}°`],
    ];
    if (this.phase === 'flight') return { rows: [...rows, best], message: null, hint: 'ESC QUIT' };

    const r = this.result!;
    const titles = {
      escaped: 'SLINGSHOT!',
      orbit: 'CAUGHT IN ORBIT',
      horizon: 'LOST TO THE HORIZON',
    } as const;
    const lines =
      r.outcome === 'horizon'
        ? [
            `It came within ${r.minR.toFixed(2)} Rs and kept falling.`,
            'Seen from outside it would slow and fade at the edge, never quite crossing.',
          ]
        : [
            `BENT ${Math.round(r.bentDeg)}° · CLOSEST ${r.minR.toFixed(2)} Rs`,
            `PROBE CLOCK LOST ${mmss(r.lostSeconds)}`,
            `SCORE ${r.score}${r.newBest ? ' · NEW BEST' : ''}`,
          ];
    return {
      rows: [...rows, ['SCORE', String(r.score)], best],
      message: { title: titles[r.outcome], lines },
      hint: 'SPACE AGAIN · ESC QUIT',
    };
  }

  dispose(): void {
    this.trail = [];
    this.preview = [];
  }
}
