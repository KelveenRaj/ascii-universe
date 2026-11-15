import * as THREE from 'three';
import { drawLabel, projectToGrid } from '@/engine/display/labels';
import type { TextLayer } from '@/engine/display/TextLayer';
import type { GameView } from '@/engine/game/Game';
import type { WorldFrame } from '@/engine/scene/SceneModule';
import { track } from '@/profile/EventSink';
import { GALAXY } from '@/scenes/milky-way/layout';
import { profileStore } from '@/state/profile';
import { worldStore, type WorldHud, type WorldTargetRow } from '@/state/world';
import { ChaseCamera } from '@/world/flight/ChaseCamera';
import { FlightInput } from '@/world/flight/FlightInput';
import { FlightModel, GALAXY_TUNING, NO_CONTROLS } from '@/world/flight/FlightModel';
import { ALIGN_S, HyperJump } from '@/world/flight/HyperJump';
import { SpaceDust } from '@/world/flight/SpaceDust';
import {
  distance,
  dot,
  length,
  normalize,
  quatFromAxisAngle,
  quatLookAt,
  quatMul,
  quatNlerp,
  sub,
  type Quat,
  type Vec3d,
} from '@/world/math';
import { Neighbourhood, type Target } from '@/world/Neighbourhood';
import { drawShip } from '@/world/ship/sprite';
import { formatDistance, nearStars } from '@/world/stars';

/** Where a new pilot starts: just above the Sun's spot in the disk, nose towards the core. */
const SPAWN: Vec3d = [0, 0.02, GALAXY.sunRadius];
/** Save your position this often while flying (and when you land). */
const SAVE_EVERY_S = 10;
/** kly → ly */
const LY = 1000;

const HINT =
  'W/S THROTTLE  ARROWS/DRAG STEER  Q/E ROLL  SHIFT BOOST  X STOP  T TARGET  J JUMP  ESC LAND';

/** Must match NEAR_MAX in the galaxy layer's shader. */
const STAR_SLOTS = 48;
/** Procedural systems considered for drawing and targeting (nearest first). */
const NEARBY_SYSTEMS = 40;
/** Procedural systems in the overlay's list. */
const LISTED_SYSTEMS = 5;
/** A jump drops you this far short of a star (kly), so it sits in front of you, not on you. */
const STAND_OFF = 0.006;
/** …and further from the black hole. */
const STAND_OFF_SGR = 0.03;
/** Within this (kly) of a star counts as a visit. */
const VISIT = 0.01;
const VISIT_SGR = 0.04;
/** How long a notice stays up (s). */
const MESSAGE_S = 4;

const isSgr = (t: Target) => t.id === 'sgr-a-star';
const standOff = (t: Target) => (isSgr(t) ? STAND_OFF_SGR : STAND_OFF);

type Jump =
  | { phase: 'align'; t: number; from: Quat; to: Quat; target: Target }
  | { phase: 'travel'; hop: HyperJump; target: Target };

const toV3 = (v: Vec3d, out: THREE.Vector3) => out.set(v[0], v[1], v[2]);

/**
 * Runs the open world for the Engine while you're flying: your ship's flight, the chase camera
 * the scene is seen through, the stars around you (for the scene to draw), targets and
 * hyperspace jumps, the specks and the ship drawn into the text layer, the readout for the
 * overlay, and saving where you are and what you've found to your pilot profile.
 *
 * For now there's one layer, the galaxy (kly). Star systems and landmarks get their own layers
 * next, each in its own units.
 */
export class WorldHost {
  private readonly input: FlightInput;
  private flight: FlightModel | null = null;
  private readonly chase = new ChaseCamera({ back: 0.004, up: 0.0012, ahead: 0.01 });
  private readonly dust = new SpaceDust(0.03);
  private readonly pose = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };
  private readonly shipPos = new THREE.Vector3();
  private readonly shipDir = new THREE.Vector3();
  private readonly targetPos = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private sinceSave = 0;
  private unsaved = { distance: 0, seconds: 0 };
  private frame = 0;
  private hudJson = '';
  private readonly hood = new Neighbourhood();
  /** Procedural systems near the ship this frame, nearest first. */
  private nearby: Target[] = [];
  private target: Target | null = null;
  private jump: Jump | null = null;
  private message: { text: string; left: number } | null = null;
  /** Places you're within visiting range of, so a visit counts once per stay. */
  private visiting = new Set<string>();
  private camPos: Vec3d = [0, 0, 0];
  /** Dev only: a fixed start (?wpos=x,y,z&wyaw=deg&wpitch=deg), so screenshots are reproducible. */
  private readonly devStart: { pos: Vec3d; orient: Quat; target: string | null } | null;

  constructor(canvas: HTMLElement) {
    this.input = new FlightInput(canvas);
    this.devStart = import.meta.env.DEV ? readDevStart() : null;
  }

  get active(): boolean {
    return this.flight !== null;
  }

  /** Starts or stops flying to match `wanted`. */
  sync(wanted: boolean): void {
    if (wanted === this.active) return;
    if (wanted) this.start();
    else this.stop();
  }

  private start(): void {
    const start = this.devStart ?? { pos: SPAWN, orient: quatFromAxisAngle([0, 1, 0], 0) };
    const flight = new FlightModel(start.pos, start.orient, GALAXY_TUNING);
    this.flight = flight;
    this.chase.reset();
    this.input.setEnabled(true);
    this.target = null;
    this.jump = null;
    this.message = null;
    this.visiting = new Set();
    this.sinceSave = 0;
    this.unsaved = { distance: 0, seconds: 0 };
    this.hood.update(flight.pos);
    this.nearby = this.hood.nearestSystems(flight.pos, NEARBY_SYSTEMS);
    track('world_launch');
    if (this.devStart) {
      const id = this.devStart.target;
      this.target = (id && this.hood.find(id)) || null;
      return;
    }
    // resume where you were last time
    void profileStore
      .getState()
      .load()
      .then((profile) => {
        const loc = profile.location?.loc;
        if (this.flight !== flight || !loc || loc.layer !== 'galaxy') return;
        if (flight.speed > 0 || flight.throttle > 0 || this.jump) return; // already flying off
        flight.pos = loc.pos;
        this.chase.reset();
      });
  }

  private stop(): void {
    this.save();
    void profileStore.getState().flush();
    this.flight = null;
    this.jump = null;
    this.input.setEnabled(false);
    worldStore.setState({ hud: null, requests: [] });
    this.hudJson = '';
  }

  /** Writes your position and the distance and time flown since the last save into the profile. */
  private save(): void {
    const flight = this.flight;
    if (!flight || this.devStart) return;
    const { distance, seconds } = this.unsaved;
    this.unsaved = { distance: 0, seconds: 0 };
    this.sinceSave = 0;
    const now = new Date().toISOString();
    profileStore.getState().update((p) => ({
      ...p,
      location: { loc: { layer: 'galaxy', pos: flight.pos }, savedAt: now },
      stats: {
        ...p.stats,
        distanceLy: p.stats.distanceLy + distance * LY,
        playSeconds: p.stats.playSeconds + seconds,
      },
    }));
  }

  /** Flies one frame. `frozen` holds everything still (paused, or dev screenshots). */
  update(dt: number, frozen: boolean): void {
    const flight = this.flight;
    if (!flight) return;
    const step = frozen ? 0 : dt;
    this.handleRequests(flight);
    const moved = this.jump
      ? this.stepJump(flight, step)
      : flight.step(step, this.input.controls());
    this.dust.update(step, flight.vel);
    this.hood.update(flight.pos);
    this.nearby = this.hood.nearestSystems(flight.pos, NEARBY_SYSTEMS);
    // visits count once you drop out of hyperspace, not as you streak past
    if (!this.jump) this.checkVisits(flight.pos);
    if (this.message && (this.message.left -= step) <= 0) this.message = null;
    this.unsaved.distance += moved;
    this.unsaved.seconds += step;
    this.sinceSave += step;
    if (this.sinceSave >= SAVE_EVERY_S) this.save();
    if (step > 0) this.frame++;

    const cam = this.chase.update(step, flight.pos, flight.forward, flight.up);
    this.camPos = cam.position;
    toV3(cam.position, this.pose.position);
    toV3(cam.target, this.pose.target);
    toV3(cam.up, this.pose.up);
    this.publishHud(flight);
  }

  /** Keys and overlay clicks: pick a target, jump. */
  private handleRequests(flight: FlightModel): void {
    for (const key of this.input.takePresses()) {
      if (key === 'KeyT') this.targetAhead(flight);
      else if (key === 'KeyJ') this.startJump(flight);
    }
    for (const r of worldStore.getState().takeRequests()) {
      if (r.type === 'jump') this.startJump(flight);
      else if (!this.jump) this.target = this.hood.find(r.id) ?? this.target;
    }
  }

  /** Every place you could target: nearby systems and the landmarks. */
  private candidates(): Target[] {
    return [...this.nearby, ...this.hood.landmarks];
  }

  /** T: the place closest to where the nose points; pressed again, the next closest. */
  private targetAhead(flight: FlightModel): void {
    if (this.jump) return;
    const fwd = flight.forward;
    const ranked = this.candidates()
      .filter((t) => distance(t.pos, flight.pos) > 1e-6)
      .map((t) => ({ t, a: dot(fwd, normalize(sub(t.pos, flight.pos))) }))
      .sort((x, y) => y.a - x.a);
    if (!ranked.length) return;
    // already on the best match: step to the next one, so T cycles through what's ahead
    const onBest = ranked[0].t.id === this.target?.id && ranked.length > 1;
    this.target = ranked[onBest ? 1 : 0].t;
  }

  private canJump(flight: FlightModel): boolean {
    const t = this.target;
    return !!t && !this.jump && distance(t.pos, flight.pos) > standOff(t) * 1.5;
  }

  /** J: turn to face the target, then jump. */
  private startJump(flight: FlightModel): void {
    const t = this.target;
    if (this.jump) return;
    if (!t) {
      this.notify('NO TARGET: PRESS T');
      return;
    }
    if (!this.canJump(flight)) {
      this.notify(`ALREADY AT ${t.name}`);
      return;
    }
    const dir = normalize(sub(t.pos, flight.pos));
    this.jump = {
      phase: 'align',
      t: 0,
      from: flight.orient,
      to: quatLookAt(dir, flight.up),
      target: t,
    };
    flight.throttle = 0;
  }

  /** Flies one frame of a jump; returns the distance covered. */
  private stepJump(flight: FlightModel, dt: number): number {
    const jump = this.jump!;
    if (jump.phase === 'align') {
      jump.t += dt;
      const u = Math.min(1, jump.t / ALIGN_S);
      // coast to a stop while turning
      const moved = flight.step(dt, NO_CONTROLS);
      flight.orient = quatNlerp(jump.from, jump.to, u * u * (3 - 2 * u));
      if (u >= 1) {
        const hop = new HyperJump(flight.pos, jump.target.pos, standOff(jump.target), LY);
        this.jump = { phase: 'travel', hop, target: jump.target };
        this.notify(`JUMPING TO ${jump.target.name}`, hop.duration);
      }
      return moved;
    }
    const before = flight.pos;
    const { pos, vel } = jump.hop.step(dt);
    flight.pos = pos;
    flight.vel = vel;
    if (jump.hop.done) {
      flight.vel = [0, 0, 0];
      this.jump = null;
      const ly = distance(jump.hop.from, jump.hop.to) * LY;
      track('world_jump', { to: jump.target.id, ly: Math.round(ly) });
      if (!this.devStart) {
        profileStore
          .getState()
          .update((p) => ({ ...p, stats: { ...p.stats, jumps: p.stats.jumps + 1 } }));
      }
      this.notify(`ARRIVED: ${jump.target.name}`);
    }
    return distance(before, flight.pos);
  }

  /** Records first visits (discoveries) and repeat visits to systems and landmarks in range. */
  private checkVisits(pos: Vec3d): void {
    const inRange = new Set<string>();
    for (const t of this.candidates()) {
      if (distance(t.pos, pos) > (isSgr(t) ? VISIT_SGR : VISIT)) continue;
      inRange.add(t.id);
      if (!this.visiting.has(t.id)) this.visit(t);
    }
    this.visiting = inRange;
  }

  private visit(t: Target): void {
    if (this.devStart) return;
    const profile = profileStore.getState().profile;
    if (!profile) return;
    const now = new Date().toISOString();
    if (t.system) {
      if (!profile.discoveries.systems[t.id]) {
        this.notify(`DISCOVERED ${t.name}`);
        track('world_discover', { kind: 'system', id: t.id });
      }
      profileStore.getState().update((p) => {
        const prev = p.discoveries.systems[t.id];
        const entry = prev ? { ...prev, visits: prev.visits + 1 } : { first: now, visits: 1 };
        return {
          ...p,
          discoveries: { ...p.discoveries, systems: { ...p.discoveries.systems, [t.id]: entry } },
        };
      });
    } else if (!profile.discoveries.landmarks[t.id]) {
      this.notify(`DISCOVERED ${t.name}`);
      track('world_discover', { kind: 'landmark', id: t.id });
      profileStore.getState().update((p) => ({
        ...p,
        discoveries: { ...p.discoveries, landmarks: { ...p.discoveries.landmarks, [t.id]: now } },
      }));
    }
  }

  private notify(text: string, seconds = MESSAGE_S): void {
    this.message = { text, left: seconds };
  }

  /** What the galaxy layer should draw besides itself: the stars around you. */
  sceneFrame(): WorldFrame | undefined {
    if (!this.flight) return undefined;
    return { stars: nearStars(this.candidates(), this.camPos, STAR_SLOTS, isSgr) };
  }

  /** Where the camera should be this frame (after `update`), or null when not flying. */
  camera(): { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null {
    return this.flight ? this.pose : null;
  }

  draw(text: TextLayer, view: GameView): void {
    const flight = this.flight;
    if (!flight) return;
    this.dust.draw(text, view.camera, view.tanHalfFov, flight.pos, flight.vel);
    if (this.target) this.drawTarget(text, view, flight, this.target);
    toV3(flight.pos, this.shipPos);
    toV3(flight.forward, this.shipDir);
    const burning = !!this.jump || flight.boosting || (flight.throttle > 0 && this.frame % 4 < 3);
    drawShip(
      text,
      view.camera,
      view.tanHalfFov,
      this.shipPos,
      this.shipDir,
      burning,
      this.frame >> 2,
    );
  }

  /** Brackets round the target with its name and distance, or an arrow at the edge pointing to it. */
  private drawTarget(text: TextLayer, view: GameView, flight: FlightModel, t: Target): void {
    toV3(t.pos, this.targetPos);
    const label = `${t.name} ${formatDistance(distance(t.pos, flight.pos))}`;
    // keep clear of the edges, and of the hint line and buttons along the bottom
    const margin = 2;
    const bottom = 6;
    const p = projectToGrid(this.targetPos, view.camera, view.tanHalfFov, text.cols, text.rows);
    if (
      p &&
      p.col >= margin &&
      p.col < text.cols - margin &&
      p.row >= margin &&
      p.row < text.rows - bottom
    ) {
      drawLabel(
        text,
        { position: this.targetPos, text: label, radius: 0, style: 'accent' },
        view.camera,
        view.tanHalfFov,
      );
      return;
    }
    // off screen or behind: an arrow on the edge, the way to turn
    this.local.copy(this.targetPos).applyMatrix4(view.camera.matrixWorldInverse);
    let x = this.local.x;
    let y = this.local.y;
    if (Math.abs(x) + Math.abs(y) < 1e-12) y = 1; // dead astern: point up
    const halfW = text.cols / 2 - margin;
    const halfH = (text.rows - margin - bottom) / 2;
    const midRow = margin + halfH;
    const k = Math.min(halfW / Math.max(Math.abs(x), 1e-12), halfH / Math.max(Math.abs(y), 1e-12));
    x *= k;
    y *= k;
    const col = Math.round(text.cols / 2 + x);
    const row = Math.round(midRow - y);
    const sideways = Math.abs(x) / halfW >= Math.abs(y) / halfH;
    const arrow = sideways ? (x > 0 ? '>' : '<') : y > 0 ? '^' : 'v';
    text.put(col, row, arrow, 'accent');
    // its name beside the arrow, kept on screen
    let nameCol = col - Math.floor(label.length / 2);
    if (arrow === '>') nameCol = col - label.length - 1;
    else if (arrow === '<') nameCol = col + 2;
    const nameRow = arrow === '^' ? row + 1 : arrow === 'v' ? row - 1 : row;
    nameCol = Math.max(0, Math.min(text.cols - label.length, nameCol));
    text.put(nameCol, nameRow, label, 'accent');
  }

  private publishHud(flight: FlightModel): void {
    const speedLy = flight.speed * LY;
    const [x, y, z] = flight.pos;
    const rows: Array<[string, string]> = [
      ['SPEED', speedLy < 0.5 ? '0 LY/S' : `${speedLy.toFixed(speedLy < 10 ? 1 : 0)} LY/S`],
      ['THROTTLE', `${Math.round(flight.throttle * 100)}%${flight.boosting ? ' BOOST' : ''}`],
      ['CORE', `${length(flight.pos).toFixed(1)} KLY`],
      ['PLANE', `${y >= 0 ? '+' : ''}${(y * LY).toFixed(0)} LY`],
      ['POS', `${x.toFixed(1)}, ${z.toFixed(1)}`],
    ];
    const t = this.target;
    if (t) {
      rows.push(['TARGET', t.name], ['DIST', formatDistance(distance(t.pos, flight.pos))]);
    }
    if (this.jump?.phase === 'travel') {
      rows.push(['JUMP', `${Math.round(this.jump.hop.progress * 100)}%`]);
    }
    const hud: WorldHud = {
      rows,
      hint: HINT,
      message: this.message?.text ?? null,
      targets: this.targetRows(flight.pos),
      canJump: this.canJump(flight),
    };
    const json = JSON.stringify(hud);
    if (json !== this.hudJson) {
      this.hudJson = json;
      worldStore.setState({ hud });
    }
  }

  /** The overlay's list: the nearest systems, then the landmarks, nearest first. */
  private targetRows(pos: Vec3d): WorldTargetRow[] {
    const row = (t: Target): WorldTargetRow => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      dist: formatDistance(distance(t.pos, pos)),
      selected: t.id === this.target?.id,
    });
    const landmarks = [...this.hood.landmarks].sort(
      (a, b) => distance(a.pos, pos) - distance(b.pos, pos),
    );
    return [...this.nearby.slice(0, LISTED_SYSTEMS), ...landmarks].map(row);
  }

  dispose(): void {
    this.sync(false);
    this.input.dispose();
  }
}

function readDevStart(): { pos: Vec3d; orient: Quat; target: string | null } | null {
  const q = new URLSearchParams(window.location.search);
  const raw = q.get('wpos');
  if (!raw) return null;
  const nums = raw.split(',').map(Number);
  if (nums.length !== 3 || !nums.every(Number.isFinite)) return null;
  const deg = (name: string) => ((Number(q.get(name)) || 0) * Math.PI) / 180;
  const yaw = quatFromAxisAngle([0, 1, 0], deg('wyaw'));
  const pitch = quatFromAxisAngle([1, 0, 0], deg('wpitch'));
  return {
    pos: [nums[0], nums[1], nums[2]],
    orient: quatMul(yaw, pitch),
    target: q.get('wtarget'),
  };
}
