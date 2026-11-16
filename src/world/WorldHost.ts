import * as THREE from 'three';
import { drawLabel, projectToGrid } from '@/engine/display/labels';
import type { TextLayer } from '@/engine/display/TextLayer';
import type { GameView } from '@/engine/game/Game';
import type { WorldFrame } from '@/engine/scene/SceneModule';
import { track } from '@/profile/EventSink';
import type { SceneId } from '@/scenes/registry';
import { GALAXY } from '@/scenes/milky-way/layout';
import { profileStore } from '@/state/profile';
import { worldStore, type WorldHud, type WorldTargetRow } from '@/state/world';
import { ChaseCamera, type ChaseRig } from '@/world/flight/ChaseCamera';
import { FlightInput } from '@/world/flight/FlightInput';
import { FlightModel, GALAXY_TUNING, NO_CONTROLS } from '@/world/flight/FlightModel';
import { ALIGN_S, HyperJump } from '@/world/flight/HyperJump';
import { SpaceDust } from '@/world/flight/SpaceDust';
import { findInterior } from '@/world/gen/planets';
import { findSystem } from '@/world/gen/sector';
import { findLandmark } from '@/world/landmarks';
import { BlackHoleLayer, blocked, keepOut, SystemLayer, type InnerLayer } from '@/world/layers';
import type { WorldLocation } from '@/world/location';
import {
  add,
  cross,
  distance,
  dot,
  length,
  normalize,
  rotate,
  quatFromAxisAngle,
  quatLookAt,
  quatMul,
  quatNlerp,
  scale,
  sub,
  type Quat,
  type Vec3d,
} from '@/world/math';
import { Neighbourhood, type Target } from '@/world/Neighbourhood';
import { DEFAULT_SHIP, type ShipDesign } from '@/world/ship/design';
import { shipModel } from '@/world/ship/model';
import type { ShipView } from '@/world/ship/ShipPass';
import { Trail } from '@/world/ship/sprite';
import { formatDistance, nearStars } from '@/world/stars';

/** Where a new pilot starts: just above the Sun's spot in the disk, nose towards the core. */
const SPAWN: Vec3d = [0, 0.02, GALAXY.sunRadius];
/** Save your position this often while flying (and when you land). */
const SAVE_EVERY_S = 10;
/** kly → ly */
const LY = 1000;

const CONTROLS = 'W/S THROTTLE  ARROWS/DRAG STEER  Q/E ROLL  SHIFT BOOST  X STOP  T TARGET';
const HINT_GALAXY = `${CONTROLS}  J JUMP  ESC LAND  ? HELP`;
const HINT_INSIDE = `${CONTROLS}  J LEAVE  ESC LAND  ? HELP`;

/** Must match NEAR_MAX in the galaxy layer's shader. */
const STAR_SLOTS = 48;
/** Procedural systems considered for drawing and targeting (nearest first). */
const NEARBY_SYSTEMS = 40;
/** Procedural systems in the overlay's list. */
const LISTED_SYSTEMS = 5;
/** A jump drops you this far short of a star (kly), then you enter its system. */
const STAND_OFF = 0.006;
/** …and further from the black hole. */
const STAND_OFF_SGR = 0.03;
/** Within this (kly) of a star counts as a visit. */
const VISIT = 0.01;
const VISIT_SGR = 0.04;
/** Fly this close (kly) to a star, or the black hole, and you go in. */
const ENTER = 0.0015;
const ENTER_SGR = 0.012;
/** How long a notice stays up (s). */
const MESSAGE_S = 4;

const GALAXY_RIG: ChaseRig = { back: 0.004, up: 0.0012, ahead: 0.01 };
const GALAXY_DUST = 0.03;

/**
 * Your ship's length as a share of the chase camera's distance in every layer: about 20–25 cells
 * nose to tail side-on at the default grid.
 */
const SHIP_SIZE = 0.24;
/** The hangar's camera: how fast it circles your ship (rad/s), and how high above it (rad). */
const SHOWROOM_SPIN = 0.3;
const SHOWROOM_RISE = 0.32;

const isSgr = (t: Target) => t.id === 'sgr-a-star';
const standOff = (t: Target) => (isSgr(t) ? STAND_OFF_SGR : STAND_OFF);

type Jump =
  | { phase: 'align'; t: number; from: Quat; to: Quat; target: Target }
  | { phase: 'travel'; hop: HyperJump; target: Target };

type DevStart = { pos: Vec3d; orient: Quat; place: string | null; target: string | null };

const toV3 = (v: Vec3d, out: THREE.Vector3) => out.set(v[0], v[1], v[2]);

/** A place in open space as a target, from its id (no neighbourhood needed). */
function placeTarget(id: string): Target | null {
  const l = findLandmark(id);
  if (l) {
    return {
      id,
      name: l.name,
      kind: l.kind,
      pos: l.pos,
      lum: l.lum,
      material: l.material,
      landmark: l,
    };
  }
  const s = findSystem(id);
  if (!s) return null;
  return { id, name: s.name, kind: '', pos: s.pos, lum: s.lum, material: s.material, system: s };
}

/** The inside of a place you can enter, or null. */
function layerFor(place: Target): InnerLayer | null {
  if (isSgr(place)) return new BlackHoleLayer(place);
  const interior = findInterior(place.id);
  return interior ? new SystemLayer(place, interior) : null;
}

/**
 * Runs the open world for the Engine while you're flying: your ship's flight, the chase camera
 * the scene is seen through, what the scene should draw around you, targets and hyperspace jumps,
 * going into star systems (and Sgr A*) and back out, the specks and the ship drawn into the text
 * layer, the readout for the overlay, and saving where you are and what you've found.
 *
 * Open space (the galaxy, in kly) is the default layer; inside a place, an InnerLayer takes over
 * with its own scene and units. Changing layer sets the world's scene, and the Engine plays a
 * warp to it.
 */
export class WorldHost {
  private readonly input: FlightInput;
  private flight: FlightModel | null = null;
  private chase = new ChaseCamera(GALAXY_RIG);
  private dust = new SpaceDust(GALAXY_DUST);
  private readonly trail = new Trail();
  private readonly pose = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };
  private readonly shipPos = new THREE.Vector3();
  private readonly targetPos = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private sinceSave = 0;
  private unsaved = { distance: 0, seconds: 0 };
  private frame = 0;
  private hudJson = '';
  private readonly hood = new Neighbourhood();
  /** Procedural systems near the ship this frame, nearest first (open space only). */
  private nearby: Target[] = [];
  /** The place you're inside, or null in open space. */
  private inner: InnerLayer | null = null;
  private target: Target | null = null;
  private jump: Jump | null = null;
  private message: { text: string; left: number } | null = null;
  /** Places you're within visiting range of, so a visit counts once per stay. */
  private visiting = new Set<string>();
  private camPos: Vec3d = [0, 0, 0];
  /** The hangar is open: the flight is parked and the camera circles the ship (angle, rad). */
  private showroom: { angle: number } | null = null;
  /** The last frame handed to a scene, kept for the old scene while a warp swaps it out. */
  private lastFrame: { sceneId: string; frame: WorldFrame } | null = null;
  /**
   * Dev only: a fixed start, so screenshots are reproducible: ?wpos=x,y,z&wyaw=deg&wpitch=deg,
   * plus &wplace=id to start inside a place (wpos then in its units) and &wtarget=id.
   */
  private readonly devStart: DevStart | null;

  constructor(canvas: HTMLElement) {
    this.input = new FlightInput(canvas);
    this.devStart = import.meta.env.DEV ? readDevStart() : null;
    // a dev start inside a place opens straight on its scene (no warp), for screenshots
    const devPlace = this.devStart?.place ? placeTarget(this.devStart.place) : null;
    const devLayer = devPlace && layerFor(devPlace);
    if (devLayer) worldStore.setState({ sceneId: devLayer.sceneId });
  }

  get active(): boolean {
    return this.flight !== null;
  }

  /** The scene for the layer the ship is in. */
  get sceneId(): SceneId {
    return this.inner?.sceneId ?? 'world-galaxy';
  }

  /** Starts or stops flying to match `wanted`. */
  sync(wanted: boolean): void {
    if (wanted === this.active) return;
    if (wanted) this.start();
    else this.stop();
  }

  private start(): void {
    const dev = this.devStart;
    const start = dev ?? { pos: SPAWN, orient: quatFromAxisAngle([0, 1, 0], 0) };
    const flight = new FlightModel(start.pos, start.orient, GALAXY_TUNING);
    this.flight = flight;
    this.input.setEnabled(true);
    this.jump = null;
    this.message = null;
    this.visiting = new Set();
    this.lastFrame = null;
    this.sinceSave = 0;
    this.unsaved = { distance: 0, seconds: 0 };
    this.setLayer(null, null);
    this.refreshNearby(flight.pos);
    track('world_launch');
    if (dev) {
      const place = dev.place ? placeTarget(dev.place) : null;
      const layer = place && layerFor(place);
      if (layer) this.setLayer(layer, null);
      flight.pos = dev.pos;
      flight.orient = dev.orient;
      this.target = (dev.target && this.findTarget(dev.target)) || null;
      return;
    }
    // resume where you were last time
    void profileStore
      .getState()
      .load()
      .then((profile) => {
        const loc = profile.location?.loc;
        if (this.flight !== flight || !loc) return;
        if (flight.speed > 0 || flight.throttle > 0 || this.jump || this.inner) return; // moved on
        this.resume(flight, loc);
      });
  }

  private resume(flight: FlightModel, loc: WorldLocation): void {
    if (loc.layer === 'galaxy') {
      flight.pos = loc.pos;
      this.refreshNearby(flight.pos);
      this.chase.reset();
      return;
    }
    const id = loc.layer === 'system' ? loc.systemId : loc.landmarkId;
    const place = placeTarget(id);
    const layer = place && layerFor(place);
    if (!place || !layer) return;
    // already inside: no "discovered" fanfare, it was found last time
    this.visiting.add(place.id);
    this.setLayer(layer, `RESUMING AT ${place.name}`);
    flight.pos = loc.pos;
    flight.orient = quatLookAt(normalize(scale(loc.pos, -1)), [0, 1, 0]);
  }

  private stop(): void {
    track('world_land', { place: this.inner?.place.id ?? 'open-space' });
    this.save();
    void profileStore.getState().flush();
    this.flight = null;
    this.jump = null;
    this.inner = null;
    this.showroom = null;
    this.input.setEnabled(false);
    worldStore.setState({
      hud: null,
      requests: [],
      sceneId: 'world-galaxy',
      warpLabel: null,
      hangarOpen: false,
    });
    this.hudJson = '';
  }

  /** Switches the flight to `layer` (null: open space) and asks for its scene, behind a warp. */
  private setLayer(layer: InnerLayer | null, warpLabel: string | null): void {
    this.inner = layer;
    const flight = this.flight;
    if (flight) {
      flight.tuning = layer?.tuning ?? GALAXY_TUNING;
      flight.vel = [0, 0, 0];
      flight.throttle = 0;
    }
    this.chase = new ChaseCamera(layer?.rig ?? GALAXY_RIG);
    this.trail.reset();
    this.dust = new SpaceDust(layer?.dustRadius ?? GALAXY_DUST);
    this.target = null;
    worldStore.setState({ sceneId: this.sceneId, warpLabel });
  }

  /** Goes inside `place`, arriving from where the ship is now. */
  private enter(flight: FlightModel, place: Target): void {
    const layer = layerFor(place);
    if (!layer) return;
    const off = sub(flight.pos, place.pos);
    const from = length(off) > 1e-9 ? normalize(off) : scale(flight.forward, -1);
    if (!this.visiting.has(place.id)) this.visit(place);
    this.visiting.add(place.id);
    this.setLayer(layer, `ENTERING ${place.name}`);
    const spawn = layer.spawn(from);
    flight.pos = spawn.pos;
    flight.orient = spawn.orient;
    track('world_enter', { id: place.id });
  }

  /** Back out to open space, a little way out from the place, heading on out. */
  private leave(flight: FlightModel): void {
    const layer = this.inner;
    if (!layer) return;
    const place = layer.place;
    const out = length(flight.pos) > 1e-9 ? normalize(flight.pos) : scale(flight.forward, -1);
    this.setLayer(null, 'OPEN SPACE');
    flight.pos = add(place.pos, scale(out, layer.exitKly));
    flight.orient = quatLookAt(out, [0, 1, 0]);
    this.visiting.add(place.id);
    this.refreshNearby(flight.pos);
    this.target = this.hood.find(place.id) ?? null;
  }

  /** Writes where you are and the distance and time flown since the last save into the profile. */
  private save(): void {
    const flight = this.flight;
    if (!flight || this.devStart) return;
    const { distance, seconds } = this.unsaved;
    this.unsaved = { distance: 0, seconds: 0 };
    this.sinceSave = 0;
    const now = new Date().toISOString();
    const loc = this.location(flight.pos);
    profileStore.getState().update((p) => ({
      ...p,
      location: { loc, savedAt: now },
      stats: {
        ...p.stats,
        distanceLy: p.stats.distanceLy + distance * LY,
        playSeconds: p.stats.playSeconds + seconds,
      },
    }));
  }

  private location(pos: Vec3d): WorldLocation {
    const layer = this.inner;
    if (!layer) return { layer: 'galaxy', pos };
    if (layer.kind === 'system') return { layer: 'system', systemId: layer.place.id, pos };
    return { layer: 'landmark', landmarkId: layer.place.id, pos };
  }

  /**
   * Flies one frame. `frozen` holds everything still (paused, warping, or dev screenshots).
   * `view` is the screen's shape, for framing the ship while the hangar is open.
   */
  update(dt: number, frozen: boolean, view: { aspect: number; tanHalfFov: number }): void {
    const flight = this.flight;
    if (!flight) return;
    if (this.syncShowroom(flight)) {
      this.showroomCamera(flight, frozen ? 0 : dt, view);
      this.publishHud(flight);
      return;
    }
    const step = frozen ? 0 : dt;
    if (!frozen) this.handleRequests(flight);
    const before = flight.pos;
    if (this.jump) this.stepJump(flight, step);
    else flight.step(step, this.input.controls());
    if (this.inner) keepOut(flight, this.inner.occluders());
    // distance is only counted in open space (each inner layer has its own units)
    const moved = this.inner ? 0 : distance(before, flight.pos);
    this.dust.update(step, flight.vel);
    // no trail through hyperspace: it would draw a line across the sky
    if (this.jump) this.trail.reset();
    else if (step > 0) {
      // the trail starts at the engine, not the middle of the ship
      toV3(add(flight.pos, scale(flight.forward, -this.shipLength() / 2)), this.shipPos);
      this.trail.update(step, this.shipPos, flight.speed > 1e-9);
    }

    if (this.inner) {
      if (this.inner.outside(flight.pos)) this.leave(flight);
    } else {
      this.refreshNearby(flight.pos);
      // visits count once you drop out of hyperspace, not as you streak past
      if (!this.jump && !frozen) {
        this.checkVisits(flight.pos);
        const close = this.candidates().find(
          (t) => distance(t.pos, flight.pos) < (isSgr(t) ? ENTER_SGR : ENTER),
        );
        if (close) this.enter(flight, close);
      }
    }

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

  /** Your ship's length in the current layer's units. */
  private shipLength(): number {
    const rig = this.chase.rig;
    return Math.hypot(rig.back, rig.up) * SHIP_SIZE;
  }

  /**
   * Opens or closes the showroom with the hangar. Opening parks the flight (stopped, no input);
   * closing hands the camera back to the chase rig. Returns whether it's open.
   */
  private syncShowroom(flight: FlightModel): boolean {
    const open = worldStore.getState().hangarOpen;
    if (open && !this.showroom) {
      // start from about where the chase camera was: behind the ship, swinging round
      this.showroom = { angle: Math.PI - 0.5 };
      flight.throttle = 0;
      flight.vel = [0, 0, 0];
      this.input.setEnabled(false);
    } else if (!open && this.showroom) {
      this.showroom = null;
      this.input.setEnabled(true);
      this.chase.reset();
    }
    return this.showroom !== null;
  }

  /**
   * The hangar's camera: slowly circling the ship, a little above it, with the ship framed in the
   * part of the screen the hangar panel leaves free (left of it on a wide screen, above the bottom
   * sheet on a tall one, matching Hangar.module.css's orientation query).
   */
  private showroomCamera(
    flight: FlightModel,
    dt: number,
    view: { aspect: number; tanHalfFov: number },
  ): void {
    const show = this.showroom!;
    show.angle += dt * SHOWROOM_SPIN;
    const tall = view.aspect < 1;
    const len = this.shipLength();
    // how much of the screen's width the ship spans
    const span = tall ? 0.85 : 0.36;
    const dist = Math.max(len * 1.3, len / (2 * view.tanHalfFov * view.aspect * span));
    const fwd = flight.forward;
    const up = flight.up;
    const right = cross(fwd, up);
    const around = add(scale(fwd, Math.cos(show.angle)), scale(right, Math.sin(show.angle)));
    const dir = add(scale(around, Math.cos(SHOWROOM_RISE)), scale(up, Math.sin(SHOWROOM_RISE)));
    const position = add(flight.pos, scale(dir, dist));
    // aim beside the ship so it lands at (sx, sy) on screen
    const sx = tall ? 0 : -0.32;
    const sy = tall ? 0.42 : 0.04;
    const cf = normalize(sub(flight.pos, position));
    const cr = normalize(cross(cf, up));
    const cu = cross(cr, cf);
    const target = add(
      flight.pos,
      add(
        scale(cr, -sx * view.tanHalfFov * view.aspect * dist),
        scale(cu, -sy * view.tanHalfFov * dist),
      ),
    );
    this.camPos = position;
    toV3(position, this.pose.position);
    toV3(target, this.pose.target);
    toV3(up, this.pose.up);
  }

  /**
   * Your ship for ShipPass this frame, or null when there's nothing to draw (not flying, or hidden
   * behind a planet, the star or the hole).
   */
  shipView(): ShipView | null {
    const flight = this.flight;
    if (!flight) return null;
    if (this.inner && blocked(this.camPos, flight.pos, this.inner.occluders())) return null;
    const cruise = flight.tuning.cruise;
    const travelling = this.jump?.phase === 'travel';
    const glow = travelling ? 1.6 : flight.boosting ? 1.4 : flight.throttle;
    const exhaust = travelling
      ? 1
      : Math.min(1, (0.75 * flight.speed) / cruise + (flight.boosting ? 0.25 : 0));
    // every layer has its light at the origin: the core, the system's star, Sgr A*'s flow
    const r = length(flight.pos);
    const light: Vec3d = r > 1e-12 ? scale(flight.pos, -1 / r) : [0, 1, 0];
    return {
      design: this.design(),
      rel: sub(flight.pos, this.camPos),
      orient: flight.orient,
      length: this.shipLength(),
      light,
      glow: this.showroom ? 0.3 : glow,
      exhaust: this.showroom ? 0 : exhaust,
    };
  }

  /** The cells the ship covers on screen (from its bounding box), or null if it's behind you. */
  private shipCells(
    view: GameView,
    cols: number,
    rows: number,
  ): { col0: number; row0: number; col1: number; row1: number } | null {
    const flight = this.flight!;
    const box = shipModel(this.design()).geometry.boundingBox!;
    const len = this.shipLength();
    let out: { col0: number; row0: number; col1: number; row1: number } | null = null;
    for (let i = 0; i < 8; i++) {
      const c: Vec3d = [
        (i & 1 ? box.max.x : box.min.x) * len,
        (i & 2 ? box.max.y : box.min.y) * len,
        (i & 4 ? box.max.z : box.min.z) * len,
      ];
      toV3(add(flight.pos, rotate(flight.orient, c)), this.local);
      const g = projectToGrid(this.local, view.camera, view.tanHalfFov, cols, rows);
      if (!g) return null;
      out = out
        ? {
            col0: Math.min(out.col0, g.col),
            row0: Math.min(out.row0, g.row),
            col1: Math.max(out.col1, g.col),
            row1: Math.max(out.row1, g.row),
          }
        : { col0: g.col, row0: g.row, col1: g.col, row1: g.row };
    }
    return out;
  }

  private refreshNearby(pos: Vec3d): void {
    this.hood.update(pos);
    this.nearby = this.hood.nearestSystems(pos, NEARBY_SYSTEMS);
  }

  /** Keys and overlay clicks: pick a target, jump (or leave). */
  private handleRequests(flight: FlightModel): void {
    for (const key of this.input.takePresses()) {
      if (key === 'KeyT') this.targetAhead(flight);
      else if (key === 'KeyJ') this.action(flight);
    }
    for (const r of worldStore.getState().takeRequests()) {
      if (r.type === 'jump') this.action(flight);
      else if (!this.jump) this.target = this.findTarget(r.id) ?? this.target;
    }
  }

  /** J: jump to the target in open space; leave, inside a place. */
  private action(flight: FlightModel): void {
    if (this.inner) this.leave(flight);
    else this.startJump(flight);
  }

  /** Every place you could target in the layer you're in. */
  private candidates(): Target[] {
    if (this.inner) return this.inner.targets();
    return [...this.nearby, ...this.hood.landmarks];
  }

  private findTarget(id: string): Target | undefined {
    return this.inner ? this.inner.targets().find((t) => t.id === id) : this.hood.find(id);
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
    return !this.inner && !!t && !this.jump && distance(t.pos, flight.pos) > standOff(t) * 1.5;
  }

  /** J in open space: turn to face the target, then jump. */
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

  /** Flies one frame of a jump. */
  private stepJump(flight: FlightModel, dt: number): void {
    const jump = this.jump!;
    if (jump.phase === 'align') {
      jump.t += dt;
      const u = Math.min(1, jump.t / ALIGN_S);
      // coast to a stop while turning
      flight.step(dt, NO_CONTROLS);
      flight.orient = quatNlerp(jump.from, jump.to, u * u * (3 - 2 * u));
      if (u >= 1) {
        const hop = new HyperJump(flight.pos, jump.target.pos, standOff(jump.target), LY);
        this.jump = { phase: 'travel', hop, target: jump.target };
        this.notify(`JUMPING TO ${jump.target.name}`, hop.duration);
      }
      return;
    }
    const { pos, vel } = jump.hop.step(dt);
    flight.pos = pos;
    flight.vel = vel;
    if (!jump.hop.done) return;
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
    // straight in: you jumped there to see it
    this.enter(flight, jump.target);
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
    } else if (t.landmark && !profile.discoveries.landmarks[t.id]) {
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

  /**
   * What the scene `sceneId` should draw besides itself (the stars, or a system's star and
   * planets). While a warp is still showing the previous layer's scene, that scene gets the last
   * frame it had.
   */
  sceneFrame(sceneId: string): WorldFrame | undefined {
    if (!this.flight) return undefined;
    if (sceneId !== this.sceneId) {
      return this.lastFrame?.sceneId === sceneId ? this.lastFrame.frame : undefined;
    }
    const frame = this.inner
      ? this.inner.sceneFrame(this.camPos)
      : { stars: nearStars(this.candidates(), this.camPos, STAR_SLOTS, isSgr) };
    this.lastFrame = { sceneId, frame };
    return frame;
  }

  /** Where the camera should be this frame (after `update`), or null when not flying. */
  camera(): { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null {
    return this.flight ? this.pose : null;
  }

  draw(text: TextLayer, view: GameView): void {
    const flight = this.flight;
    // the ship itself is a mesh in the scene (ShipPass); in the hangar only the ship shows
    if (!flight || this.showroom) return;
    this.dust.draw(text, view.camera, view.tanHalfFov, flight.pos, flight.vel);
    if (this.target) this.drawTarget(text, view, flight, this.target);
    const hidden = this.inner && blocked(this.camPos, flight.pos, this.inner.occluders());
    const ship = hidden ? null : this.shipCells(view, text.cols, text.rows);
    this.trail.draw(text, view.camera, view.tanHalfFov, this.design().trail, ship);
  }

  /** Your ship as designed in the hangar (the default until the profile has loaded). */
  private design(): ShipDesign {
    return profileStore.getState().profile?.ship ?? DEFAULT_SHIP;
  }

  private formatDistance(d: number): string {
    return this.inner ? this.inner.formatDistance(d) : formatDistance(d);
  }

  /** Brackets round the target with its name and distance, or an arrow at the edge pointing to it. */
  private drawTarget(text: TextLayer, view: GameView, flight: FlightModel, t: Target): void {
    toV3(t.pos, this.targetPos);
    const label = `${t.name} ${this.formatDistance(distance(t.pos, flight.pos))}`;
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
      // in a system, frame the planet itself; in open space stars are points
      drawLabel(
        text,
        { position: this.targetPos, text: label, radius: this.targetRadius(t), style: 'accent' },
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

  private targetRadius(t: Target): number {
    const inner = this.inner;
    if (!(inner instanceof SystemLayer)) return 0;
    return inner.interior.planets.find((p) => p.id === t.id)?.radius ?? 0;
  }

  private publishHud(flight: FlightModel): void {
    const inner = this.inner;
    const speed = flight.speed;
    const throttle = `${Math.round(flight.throttle * 100)}%${flight.boosting ? ' BOOST' : ''}`;
    let rows: Array<[string, string]>;
    if (inner) {
      const shown = speed < 0.05 ? '0' : speed.toFixed(speed < 10 ? 1 : 0);
      rows = [
        ['SPEED', `${shown} ${inner.speedUnit}`],
        ['THROTTLE', throttle],
        ...inner.hudRows(flight.pos),
      ];
    } else {
      const speedLy = speed * LY;
      const [x, y, z] = flight.pos;
      rows = [
        ['SPEED', speedLy < 0.5 ? '0 LY/S' : `${speedLy.toFixed(speedLy < 10 ? 1 : 0)} LY/S`],
        ['THROTTLE', throttle],
        ['CORE', `${length(flight.pos).toFixed(1)} KLY`],
        ['PLANE', `${y >= 0 ? '+' : ''}${(y * LY).toFixed(0)} LY`],
        ['POS', `${x.toFixed(1)}, ${z.toFixed(1)}`],
      ];
    }
    const t = this.target;
    if (t) {
      rows.push(['TARGET', t.name], ['DIST', this.formatDistance(distance(t.pos, flight.pos))]);
    }
    if (this.jump?.phase === 'travel') {
      rows.push(['JUMP', `${Math.round(this.jump.hop.progress * 100)}%`]);
    }
    const hud: WorldHud = {
      title: inner ? inner.place.name : 'OPEN SPACE',
      rows,
      hint: inner ? HINT_INSIDE : HINT_GALAXY,
      message: this.message?.text ?? null,
      targets: this.targetRows(flight.pos),
      action: inner ? 'LEAVE' : this.canJump(flight) ? 'JUMP' : null,
    };
    const json = JSON.stringify(hud);
    if (json !== this.hudJson) {
      this.hudJson = json;
      worldStore.setState({ hud });
    }
  }

  /** The overlay's list: inside, the planets; in open space the nearest systems, then landmarks. */
  private targetRows(pos: Vec3d): WorldTargetRow[] {
    const row = (t: Target): WorldTargetRow => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      dist: this.formatDistance(distance(t.pos, pos)),
      selected: t.id === this.target?.id,
    });
    if (this.inner) return this.inner.targets().map(row);
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

function readDevStart(): DevStart | null {
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
    place: q.get('wplace'),
    target: q.get('wtarget'),
  };
}
