import * as THREE from 'three';
import { projectToGrid } from '@/engine/display/labels';
import type { TextLayer, TextStyle } from '@/engine/display/TextLayer';
import type {
  GameCamera,
  GameContext,
  GameHud,
  GameInputFrame,
  GameInstance,
  GameView,
} from '@/engine/game/Game';
import { drawShip } from '@/games/slingshot/ship';
import { Flight } from '@/scenes/black-hole/flight';
import { SGR_A_SECONDS_PER_UNIT } from '@/scenes/black-hole/orbit';
import { BLACK_HOLE_PARAMS } from '@/scenes/black-hole/params';

/** Outside-clock time (r_s/c) per real second of flight, far from the hole. */
export const SIM_RATE = 20;
/** Give up on a ship still going round after this much outside time: it's in orbit. */
export const ORBIT_TIMEOUT = 1500;
/** Where every round starts (r_s): above the disk plane, off to one side. */
export const START = new THREE.Vector3(-17, 9, 10);
/** Past this distance, heading out, the ship has escaped. */
export const ESCAPE_R = 36;
/** The disk the ship can hit: the scene's defaults (r_s). */
export const DISK_INNER = BLACK_HOLE_PARAMS.diskInner.default;
export const DISK_OUTER = BLACK_HOLE_PARAMS.diskOuter.default;
/** Fuel, as total speed change the engine can give (fraction of c). */
export const FUEL_DV = 0.25;

const MIN_SPEED = 0.05;
const MAX_SPEED = 0.9;
const AIM_RATE = 0.5; // rad/s while held
const AIM_TAP = Math.PI / 180;
const SPEED_RATE = 0.2; // c/s while held
const SPEED_TAP = 0.01;
const BURN_RATE = 0.08; // c/s while held
const BURN_TAP = 0.005; // per button tap
const TRAIL_SPACING = 0.35; // r_s between trail dots
const PREVIEW_TIME = 30; // r_s/c of path shown while aiming (the start of it, not the whole answer)
const DEFAULT_TURN = 0.22; // rad: the first aim passes just to one side of the hole
const DEFAULT_TILT = 0.12;
const DEFAULT_SPEED = 0.45;
const DISK_MESSAGE_SECONDS = 2.5;
/** Chase camera: behind and above the ship, never closer to the hole than the shader allows. */
const CHASE_BACK = 5;
const CHASE_UP = 1.8;
const CAMERA_MIN_R = 2.9;
const CAMERA_EASE = 4; // 1/s

type Phase = 'aim' | 'flight' | 'result';
type View = 'chase' | 'wide' | 'free';
const VIEWS: readonly View[] = ['chase', 'wide', 'free'];

export type Outcome = 'escaped' | 'horizon' | 'orbit' | 'destroyed';

export interface RoundResult {
  outcome: Outcome;
  /** How far the path turned in total, degrees. */
  bentDeg: number;
  /** Closest approach, r_s. */
  minR: number;
  /** Seconds the ship's clock fell behind compared with staying at the launch point's rate. */
  lostSeconds: number;
  /** Hull left, 0–1. */
  hull: number;
  /** Fuel left, 0–1. */
  fuel: number;
  score: number;
}

/**
 * Points: 10 per degree of bending plus 1 per second lost, scaled by the hull left, plus up to 200
 * for unused fuel. Falling in or burning up scores nothing.
 */
export function scoreRound(
  outcome: Outcome,
  bentDeg: number,
  lostSeconds: number,
  hull = 1,
  fuel = 0,
): number {
  if (outcome === 'horizon' || outcome === 'destroyed') return 0;
  return Math.round((bentDeg * 10 + Math.max(0, lostSeconds)) * hull + 200 * fuel);
}

/**
 * Damage (share of the hull) for crossing the disk plane at radius r: none outside the disk or in
 * the gap inside its inner edge, 20% at the outer edge rising to 100% at the inner edge.
 */
export function diskDamage(r: number): number {
  if (r < DISK_INNER || r > DISK_OUTER) return 0;
  const depth = (DISK_OUTER - r) / (DISK_OUTER - DISK_INNER);
  return 0.2 + 0.8 * depth ** 1.5;
}

/** Outside time per real second: slower near the hole, so the close pass plays out on screen. */
export function simRate(r: number): number {
  return SIM_RATE * Math.min(1, Math.max(0.2, (r / 12) ** 1.5));
}

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Unit vector for yaw (around world up, 0 = +Z) and pitch (above the XZ plane). */
function direction(out: THREE.Vector3, yaw: number, pitch: number): THREE.Vector3 {
  const c = Math.cos(pitch);
  return out.set(c * Math.sin(yaw), Math.sin(pitch), c * Math.cos(yaw));
}

/** Where the ship crossed the disk plane between two points, if inside the disk: its radius. */
function diskCrossing(a: THREE.Vector3, b: THREE.Vector3): number | null {
  if (a.y === b.y || Math.sign(a.y) === Math.sign(b.y)) return null;
  const k = a.y / (a.y - b.y);
  const r = Math.hypot(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k);
  return r;
}

/**
 * Slingshot: fling a ship past Sagittarius A* in 3D and bend its path as hard as you dare.
 *
 * The ship flies a real Schwarzschild orbit (scenes/black-hole/flight.ts). Aim it in 3D, launch,
 * then ride along behind it. The engine can speed up, slow down or steer, with limited fuel; a burn
 * at the closest point does the most (the Oberth effect). The accretion disk is the hazard:
 * crossing its plane through the disk damages the hull, and close in it's fatal.
 */
export class Slingshot implements GameInstance {
  private phase: Phase = 'aim';
  private launched = false;
  /** Aim, relative to pointing straight at the hole: turn (yaw) and tilt (pitch). */
  private turn = DEFAULT_TURN;
  private tilt = DEFAULT_TILT;
  private speed = DEFAULT_SPEED;
  private flight: Flight | null = null;
  private view: View = 'chase';
  private burning = false;
  private fuelUsed = 0;
  private hull = 1;
  private minR = Infinity;
  private bent = 0;
  private readonly lastDir = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3();
  private baseRate = 1;
  private diskMessage: { damage: number; time: number } | null = null;
  private result: (RoundResult & { newBest: boolean }) | null = null;
  private trail: THREE.Vector3[] = [];
  private preview: THREE.Vector3[] = [];
  private previewHits: THREE.Vector3[] = [];
  private previewKey = '';
  private frame = 0;
  private time = 0;
  private resetOrbit = false;
  private readonly cam: { position: THREE.Vector3; target: THREE.Vector3; ready: boolean };
  private readonly ctx: GameContext;
  // scratch
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    this.cam = { position: new THREE.Vector3(), target: new THREE.Vector3(), ready: false };
  }

  /** The last finished round, for tests. */
  get lastResult(): RoundResult | null {
    return this.result;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  // ---- aiming ---------------------------------------------------------------------------------

  /** Launch direction for the current aim. */
  private aimDirection(out: THREE.Vector3): THREE.Vector3 {
    const toHole = this.tmp2.copy(START).negate().normalize();
    const yaw = Math.atan2(toHole.x, toHole.z) + this.turn;
    const pitch = Math.asin(toHole.y) + this.tilt;
    return direction(out, yaw, pitch);
  }

  private newFlight(): Flight {
    const v = this.aimDirection(new THREE.Vector3()).multiplyScalar(this.speed);
    return new Flight(START, v);
  }

  update(dt: number, input: GameInputFrame, view: GameView): void {
    this.frame++;
    this.time += dt;
    if (input.pressed('view') && this.phase !== 'aim') {
      this.view = VIEWS[(VIEWS.indexOf(this.view) + 1) % VIEWS.length];
    }

    if (this.phase === 'aim') {
      const axis = (a: 'left' | 'up', b: 'right' | 'down') =>
        (Number(input.held(a)) - Number(input.held(b))) * AIM_RATE * dt +
        (Number(input.pressed(a)) - Number(input.pressed(b))) * AIM_TAP;
      this.turn = Math.max(-Math.PI, Math.min(Math.PI, this.turn + axis('left', 'right')));
      this.tilt = Math.max(-1.3, Math.min(1.3, this.tilt + axis('up', 'down')));
      const faster =
        (Number(input.held('faster')) - Number(input.held('slower'))) * SPEED_RATE * dt +
        (Number(input.pressed('faster')) - Number(input.pressed('slower'))) * SPEED_TAP;
      this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.speed + faster));
      if (input.pressed('fire')) this.fire(view);
      return;
    }

    if (this.phase === 'result') {
      if (input.pressed('fire')) {
        this.phase = 'aim';
        this.flight = null;
        this.trail = [];
        this.result = null;
        this.diskMessage = null;
        this.resetOrbit = true;
        this.cam.ready = false;
      }
      return;
    }

    this.steer(dt, input);
    this.fly(dt);
    this.updateCamera(dt, view);
  }

  private fire(view: GameView): void {
    const f = this.newFlight();
    this.flight = f;
    this.phase = 'flight';
    this.launched = true;
    this.view = 'chase';
    this.fuelUsed = 0;
    this.hull = 1;
    this.minR = f.r;
    this.bent = 0;
    this.burning = false;
    f.velocity(this.lastDir).normalize();
    f.position(this.lastPos);
    this.trail = [this.lastPos.clone()];
    this.baseRate = (1 - 1 / f.r) / f.orbit.E;
    // the chase camera swoops in from wherever the player was looking
    this.cam.position.copy(view.camera.position);
    this.cam.target.set(0, 0, 0);
    this.cam.ready = true;
  }

  // ---- flying ---------------------------------------------------------------------------------

  /** Engine burns: W/S along the path, arrows across it. */
  private steer(dt: number, input: GameInputFrame): void {
    const f = this.flight!;
    const amount = (a: 'faster' | 'up' | 'right', b: 'slower' | 'down' | 'left') =>
      (Number(input.held(a)) - Number(input.held(b))) * BURN_RATE * dt +
      (Number(input.pressed(a)) - Number(input.pressed(b))) * BURN_TAP;
    const along = amount('faster', 'slower');
    const up = amount('up', 'down');
    const right = amount('right', 'left');
    const wanted = Math.abs(along) + Math.abs(up) + Math.abs(right);
    this.burning = false;
    const left = FUEL_DV - this.fuelUsed;
    if (wanted <= 0 || left <= 0) return;
    const scale = Math.min(1, left / wanted);

    const fwd = f.velocity(this.vel).normalize();
    // "up" is world up made square to the path (or the plane's normal when flying straight up)
    const upDir = this.tmp.copy(WORLD_UP).addScaledVector(fwd, -fwd.y);
    if (upDir.lengthSq() < 1e-6) f.normal(upDir);
    upDir.normalize();
    const rightDir = this.tmp2.crossVectors(fwd, upDir).normalize();
    const dv = new THREE.Vector3()
      .addScaledVector(fwd, along * scale)
      .addScaledVector(upDir, up * scale)
      .addScaledVector(rightDir, right * scale);
    f.burn(dv);
    this.fuelUsed += wanted * scale;
    this.burning = true;
    f.velocity(this.lastDir).normalize(); // a burn's turn isn't gravity's bending
  }

  private fly(dt: number): void {
    const f = this.flight!;
    const event = f.advance(dt * simRate(f.r), (s) => {
      this.minR = Math.min(this.minR, s.r);
      s.position(this.pos);
      const dir = s.velocity(this.vel).normalize();
      this.bent += this.lastDir.angleTo(dir);
      this.lastDir.copy(dir);
      const r = diskCrossing(this.lastPos, this.pos);
      if (r !== null) this.hitDisk(r);
      this.lastPos.copy(this.pos);
      if (this.pos.distanceTo(this.trail[this.trail.length - 1]) > TRAIL_SPACING) {
        this.trail.push(this.pos.clone());
      }
    });
    if (this.phase !== 'flight') return; // destroyed in the disk
    if (event === 'horizon') this.finish('horizon');
    else if (f.r > ESCAPE_R && f.orbit.vr > 0) this.finish('escaped');
    else if (f.t > ORBIT_TIMEOUT) this.finish('orbit');
  }

  private hitDisk(r: number): void {
    const damage = diskDamage(r);
    if (damage <= 0 || this.phase !== 'flight') return;
    this.hull = Math.max(0, this.hull - damage);
    this.diskMessage = { damage, time: this.time };
    if (this.hull <= 0) this.finish('destroyed');
  }

  private finish(outcome: Outcome): void {
    const f = this.flight!;
    const bentDeg = (this.bent * 180) / Math.PI;
    const lostSeconds = Math.max(0, (f.t * this.baseRate - f.tau) * SGR_A_SECONDS_PER_UNIT);
    const fuel = Math.max(0, 1 - this.fuelUsed / FUEL_DV);
    const score = scoreRound(outcome, bentDeg, lostSeconds, this.hull, fuel);
    const before = this.ctx.best;
    if (score > 0) this.ctx.submitScore(score);
    this.result = {
      outcome,
      bentDeg,
      minR: this.minR,
      lostSeconds,
      hull: this.hull,
      fuel,
      score,
      newBest: score > before,
    };
    this.burning = false;
    this.phase = 'result';
  }

  // ---- camera ---------------------------------------------------------------------------------

  /** Eases the game-placed camera towards where the current view wants it. */
  private updateCamera(dt: number, view: GameView): void {
    const f = this.flight;
    if (!f || this.view === 'free') return;
    const want = this.tmp;
    const look = this.tmp2;
    if (this.view === 'chase') {
      const ship = f.position(this.pos);
      const fwd = f.velocity(this.vel).normalize();
      const up = new THREE.Vector3().copy(WORLD_UP).addScaledVector(fwd, -fwd.y);
      if (up.lengthSq() < 1e-6) up.set(1, 0, 0);
      up.normalize();
      want.copy(ship).addScaledVector(fwd, -CHASE_BACK).addScaledVector(up, CHASE_UP);
      // look ahead of the ship, pulled a little towards the hole so it stays in the picture
      look.copy(ship).addScaledVector(fwd, 6).multiplyScalar(0.7);
    } else {
      // wide: square on to the orbit plane, from its upper side, framing the whole flight
      const n = f.normal(want);
      if (n.y < 0) n.negate();
      n.addScaledVector(WORLD_UP, 0.4).normalize();
      want.multiplyScalar((0.85 * ESCAPE_R) / view.tanHalfFov);
      look.set(0, 0, 0);
    }
    if (!this.cam.ready) {
      this.cam.position.copy(want);
      this.cam.target.copy(look);
      this.cam.ready = true;
    }
    const k = 1 - Math.exp(-CAMERA_EASE * dt);
    this.cam.position.lerp(want, k);
    this.cam.target.lerp(look, k);
    const r = this.cam.position.length();
    if (r < CAMERA_MIN_R) this.cam.position.multiplyScalar(CAMERA_MIN_R / r);
  }

  camera(): GameCamera {
    if (this.phase === 'aim' || this.view === 'free' || !this.cam.ready) {
      const jump = this.resetOrbit;
      this.resetOrbit = false;
      return jump ? { mode: 'orbit', reset: true } : ORBIT;
    }
    return { mode: 'fixed', position: this.cam.position, target: this.cam.target };
  }

  // ---- drawing --------------------------------------------------------------------------------

  private updatePreview(): void {
    const key = `${this.turn}|${this.tilt}|${this.speed}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    const f = this.newFlight();
    const points: THREE.Vector3[] = [];
    const hits: THREE.Vector3[] = [];
    const prev = START.clone();
    let last = START.clone();
    const p = new THREE.Vector3();
    f.advance(PREVIEW_TIME, (s) => {
      s.position(p);
      const r = diskCrossing(prev, p);
      if (r !== null && diskDamage(r) > 0) hits.push(p.clone());
      prev.copy(p);
      if (p.distanceTo(last) > 0.9) {
        last = p.clone();
        points.push(last);
      }
    });
    this.preview = points;
    this.previewHits = hits;
  }

  draw(text: TextLayer, view: GameView): void {
    const plot = (p: THREE.Vector3, ch: string, style: TextStyle) => {
      const cell = projectToGrid(p, view.camera, view.tanHalfFov, text.cols, text.rows);
      if (cell) text.put(cell.col, cell.row, ch, style);
    };

    if (this.phase === 'aim') {
      this.updatePreview();
      for (const p of this.preview) plot(p, '.', 'accent');
      for (const p of this.previewHits) plot(p, 'X', 'bright');
      drawShip(
        text,
        view.camera,
        view.tanHalfFov,
        START,
        this.aimDirection(this.vel),
        false,
        this.frame,
      );
      return;
    }

    const recent = this.trail.length - 40;
    this.trail.forEach((p, i) => plot(p, '.', i < recent ? 'dim' : 'normal'));
    const f = this.flight;
    if (f && this.result?.outcome !== 'horizon' && this.result?.outcome !== 'destroyed') {
      drawShip(
        text,
        view.camera,
        view.tanHalfFov,
        f.position(this.pos),
        f.velocity(this.vel),
        this.burning,
        this.frame,
      );
    }
  }

  // ---- HUD ------------------------------------------------------------------------------------

  hud(): GameHud {
    const best: [string, string] = ['BEST', String(this.ctx.best)];
    const fuelLeft = Math.max(0, 1 - this.fuelUsed / FUEL_DV);
    if (this.phase === 'aim') {
      return {
        rows: [
          ['TURN', deg(this.turn)],
          ['TILT', deg(this.tilt)],
          ['SPEED', `${this.speed.toFixed(2)} c`],
          best,
        ],
        message: this.launched
          ? null
          : {
              title: 'SLINGSHOT',
              lines: [
                'Fling your ship past Sgr A* and bend its path.',
                'Thread past the disk: crossing it burns the hull.',
                'Skim too close and it never comes back.',
              ],
            },
        hint: '< > ↑ ↓ AIM · W S SPEED · SPACE LAUNCH · DRAG TO LOOK · ESC QUIT',
      };
    }

    const f = this.flight!;
    const rows: Array<[string, string]> = [
      ['SPEED', `${f.velocity(this.vel).length().toFixed(2)} c`],
      ['DIST', `${f.r.toFixed(1)} Rs`],
      ['HULL', `${Math.round(this.hull * 100)}%`],
      ['FUEL', `${Math.round(fuelLeft * 100)}%`],
      ['OUTSIDE', mmss(f.t * SGR_A_SECONDS_PER_UNIT)],
      ['SHIP', mmss(f.tau * SGR_A_SECONDS_PER_UNIT)],
      ['BENT', `${Math.round((this.bent * 180) / Math.PI)}°`],
      ['VIEW', this.view.toUpperCase()],
    ];

    if (this.phase === 'flight') {
      const hit = this.diskMessage;
      const message =
        hit && this.time - hit.time < DISK_MESSAGE_SECONDS
          ? {
              title: 'DISK HIT',
              lines: [
                `-${Math.round(hit.damage * 100)}% HULL · ${Math.round(this.hull * 100)}% LEFT`,
              ],
            }
          : null;
      return {
        rows: [...rows, best],
        message,
        hint: 'W S BURN · < > ↑ ↓ STEER · F VIEW · ESC QUIT',
      };
    }

    const r = this.result!;
    const titles: Record<Outcome, string> = {
      escaped: 'SLINGSHOT!',
      orbit: 'CAUGHT IN ORBIT',
      horizon: 'LOST TO THE HORIZON',
      destroyed: 'BURNED UP IN THE DISK',
    };
    let lines: string[];
    if (r.outcome === 'horizon') {
      lines = [
        `It came within ${r.minR.toFixed(2)} Rs and kept falling.`,
        'Seen from outside it would slow and fade at the edge, never quite crossing.',
      ];
    } else if (r.outcome === 'destroyed') {
      lines = [
        'The disk is plasma at millions of degrees, orbiting at a good fraction of c.',
        'Cross its plane outside it, or in the gap inside its inner edge.',
      ];
    } else {
      lines = [
        `BENT ${Math.round(r.bentDeg)}° · CLOSEST ${r.minR.toFixed(2)} Rs`,
        `SHIP CLOCK LOST ${mmss(r.lostSeconds)} · HULL ${Math.round(r.hull * 100)}% · FUEL ${Math.round(r.fuel * 100)}%`,
        `SCORE ${r.score}${r.newBest ? ' · NEW BEST' : ''}`,
      ];
    }
    return {
      rows: [...rows, ['SCORE', String(r.score)], best],
      message: { title: titles[r.outcome], lines },
      hint: 'SPACE AGAIN · F VIEW · ESC QUIT',
    };
  }

  dispose(): void {
    this.trail = [];
    this.preview = [];
    this.previewHits = [];
  }
}

const ORBIT: GameCamera = { mode: 'orbit' };
