import * as THREE from 'three';
import type { TextLayer } from '@/engine/display/TextLayer';
import type { GameView } from '@/engine/game/Game';
import { track } from '@/profile/EventSink';
import { GALAXY } from '@/scenes/milky-way/layout';
import { profileStore } from '@/state/profile';
import { worldStore, type WorldHud } from '@/state/world';
import { ChaseCamera } from '@/world/flight/ChaseCamera';
import { FlightInput } from '@/world/flight/FlightInput';
import { FlightModel, GALAXY_TUNING } from '@/world/flight/FlightModel';
import { SpaceDust } from '@/world/flight/SpaceDust';
import { length, quatFromAxisAngle, quatMul, type Quat, type Vec3d } from '@/world/math';
import { drawShip } from '@/world/ship/sprite';

/** Where a new pilot starts: just above the Sun's spot in the disk, nose towards the core. */
const SPAWN: Vec3d = [0, 0.02, GALAXY.sunRadius];
/** Save your position this often while flying (and when you land). */
const SAVE_EVERY_S = 10;
/** kly → ly */
const LY = 1000;

const HINT = 'W/S THROTTLE  ARROWS/DRAG STEER  Q/E ROLL  SHIFT BOOST  X STOP  ESC LAND';

const toV3 = (v: Vec3d, out: THREE.Vector3) => out.set(v[0], v[1], v[2]);

/**
 * Runs the open world for the Engine while you're flying: your ship's flight, the chase camera
 * the scene is seen through, the specks and the ship drawn into the text layer, the readout for
 * the overlay, and saving where you are to your pilot profile.
 *
 * For now there's one layer, the galaxy (kly). Star systems and landmarks come next, each in its
 * own units, with jumps between them.
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
  private sinceSave = 0;
  private unsaved = { distance: 0, seconds: 0 };
  private frame = 0;
  private hudJson = '';
  /** Dev only: a fixed start (?wpos=x,y,z&wyaw=deg&wpitch=deg), so screenshots are reproducible. */
  private readonly devStart: { pos: Vec3d; orient: Quat } | null;

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
    this.sinceSave = 0;
    this.unsaved = { distance: 0, seconds: 0 };
    track('world_launch');
    if (this.devStart) return;
    // resume where you were last time
    void profileStore
      .getState()
      .load()
      .then((profile) => {
        const loc = profile.location?.loc;
        if (this.flight !== flight || !loc || loc.layer !== 'galaxy') return;
        if (flight.speed > 0 || flight.throttle > 0) return; // already flying off from the spawn
        flight.pos = loc.pos;
        this.chase.reset();
      });
  }

  private stop(): void {
    this.save();
    void profileStore.getState().flush();
    this.flight = null;
    this.input.setEnabled(false);
    worldStore.setState({ hud: null });
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
    const moved = flight.step(step, this.input.controls());
    this.dust.update(step, flight.vel);
    this.unsaved.distance += moved;
    this.unsaved.seconds += step;
    this.sinceSave += step;
    if (this.sinceSave >= SAVE_EVERY_S) this.save();
    if (step > 0) this.frame++;

    const cam = this.chase.update(step, flight.pos, flight.forward, flight.up);
    toV3(cam.position, this.pose.position);
    toV3(cam.target, this.pose.target);
    toV3(cam.up, this.pose.up);
    this.publishHud(flight);
  }

  /** Where the camera should be this frame (after `update`), or null when not flying. */
  camera(): { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 } | null {
    return this.flight ? this.pose : null;
  }

  draw(text: TextLayer, view: GameView): void {
    const flight = this.flight;
    if (!flight) return;
    this.dust.draw(text, view.camera, view.tanHalfFov, flight.pos, flight.vel);
    toV3(flight.pos, this.shipPos);
    toV3(flight.forward, this.shipDir);
    const burning = flight.boosting || (flight.throttle > 0 && this.frame % 4 < 3);
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

  private publishHud(flight: FlightModel): void {
    const speedLy = flight.speed * LY;
    const [x, y, z] = flight.pos;
    const hud: WorldHud = {
      rows: [
        ['SPEED', speedLy < 0.5 ? '0 LY/S' : `${speedLy.toFixed(speedLy < 10 ? 1 : 0)} LY/S`],
        ['THROTTLE', `${Math.round(flight.throttle * 100)}%${flight.boosting ? ' BOOST' : ''}`],
        ['CORE', `${length(flight.pos).toFixed(1)} KLY`],
        ['PLANE', `${y >= 0 ? '+' : ''}${(y * LY).toFixed(0)} LY`],
        ['POS', `${x.toFixed(1)}, ${z.toFixed(1)}`],
      ],
      hint: HINT,
    };
    const json = JSON.stringify(hud);
    if (json !== this.hudJson) {
      this.hudJson = json;
      worldStore.setState({ hud });
    }
  }

  dispose(): void {
    this.sync(false);
    this.input.dispose();
  }
}

function readDevStart(): { pos: Vec3d; orient: Quat } | null {
  const q = new URLSearchParams(window.location.search);
  const raw = q.get('wpos');
  if (!raw) return null;
  const nums = raw.split(',').map(Number);
  if (nums.length !== 3 || !nums.every(Number.isFinite)) return null;
  const deg = (name: string) => ((Number(q.get(name)) || 0) * Math.PI) / 180;
  const yaw = quatFromAxisAngle([0, 1, 0], deg('wyaw'));
  const pitch = quatFromAxisAngle([1, 0, 0], deg('wpitch'));
  return { pos: [nums[0], nums[1], nums[2]], orient: quatMul(yaw, pitch) };
}
