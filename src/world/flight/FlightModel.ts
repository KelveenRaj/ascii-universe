import {
  add,
  length,
  QUAT_IDENTITY,
  quatFromAxisAngle,
  quatMul,
  quatNormalize,
  rotate,
  scale,
  sub,
  ZERO,
  type Quat,
  type Vec3d,
} from '@/world/math';

/** What the pilot asks for this frame. Axes are −1…1; positive pitch is nose up, yaw left, roll right. */
export interface FlightControls {
  pitch: number;
  yaw: number;
  roll: number;
  /** −1 (throttle down), 0 or 1 (throttle up), held. */
  throttle: number;
  /** Cut the throttle to zero. */
  stop: boolean;
  boost: boolean;
}

export const NO_CONTROLS: FlightControls = {
  pitch: 0,
  yaw: 0,
  roll: 0,
  throttle: 0,
  stop: false,
  boost: false,
};

/** How a ship handles in one layer, in that layer's units per second. */
export interface FlightTuning {
  /** Speed at full throttle. */
  cruise: number;
  /** Speed multiplier while boosting. */
  boost: number;
  /** How quickly the speed settles on the throttle's (1/s); also the auto-brake. */
  response: number;
  /** Top turn rate (rad/s) for pitch and yaw, and for roll. */
  turnRate: number;
  rollRate: number;
}

/** Galaxy layer, in kly: 20 ly/s cruising, 400 ly/s boosting. */
export const GALAXY_TUNING: FlightTuning = {
  cruise: 0.02,
  boost: 20,
  response: 1.6,
  turnRate: 1.3,
  rollRate: 2.2,
};

/** Throttle change per second while W / S is held. */
const THROTTLE_RATE = 0.8;
/** How quickly turning starts and stops (1/s): soft, but never sluggish. */
const TURN_RESPONSE = 7;
const FORWARD: Vec3d = [0, 0, -1];
const UP: Vec3d = [0, 1, 0];
const RIGHT: Vec3d = [1, 0, 0];

/**
 * Chill arcade flight: the throttle sets a cruising speed (it stays where you leave it), the ship
 * eases to that speed along its nose, so letting go of the throttle (or X) brakes on its own and
 * there's no drifting sideways after a turn. Boost multiplies the speed. Turns ease in and out.
 * Float64 throughout; units are whatever the layer's tuning is in.
 */
export class FlightModel {
  pos: Vec3d;
  vel: Vec3d = ZERO;
  orient: Quat;
  /** 0…1 */
  throttle = 0;
  boosting = false;
  /** Current pitch, yaw, roll rates (rad/s). */
  private spin: Vec3d = ZERO;
  tuning: FlightTuning;

  constructor(pos: Vec3d, orient: Quat = QUAT_IDENTITY, tuning: FlightTuning = GALAXY_TUNING) {
    this.pos = pos;
    this.orient = orient;
    this.tuning = tuning;
  }

  get forward(): Vec3d {
    return rotate(this.orient, FORWARD);
  }

  get up(): Vec3d {
    return rotate(this.orient, UP);
  }

  get speed(): number {
    return length(this.vel);
  }

  /** Advances by `dt` seconds. Returns the distance flown. */
  step(dt: number, c: FlightControls): number {
    if (dt <= 0) return 0;
    const t = this.tuning;
    if (c.stop) this.throttle = 0;
    else this.throttle = Math.min(1, Math.max(0, this.throttle + c.throttle * THROTTLE_RATE * dt));
    this.boosting = c.boost && this.throttle > 0;

    const k = 1 - Math.exp(-TURN_RESPONSE * dt);
    const want: Vec3d = [c.pitch * t.turnRate, c.yaw * t.turnRate, -c.roll * t.rollRate];
    this.spin = add(this.spin, scale(sub(want, this.spin), k));
    const [p, y, r] = this.spin;
    // rotations in the ship's own frame: right-multiply
    let q = this.orient;
    if (p !== 0) q = quatMul(q, quatFromAxisAngle(RIGHT, p * dt));
    if (y !== 0) q = quatMul(q, quatFromAxisAngle(UP, y * dt));
    if (r !== 0) q = quatMul(q, quatFromAxisAngle(FORWARD, -r * dt));
    this.orient = quatNormalize(q);

    const target = this.throttle * t.cruise * (this.boosting ? t.boost : 1);
    const response = this.boosting ? t.response * 1.5 : t.response;
    const kv = 1 - Math.exp(-response * dt);
    this.vel = add(this.vel, scale(sub(scale(this.forward, target), this.vel), kv));
    const moved = scale(this.vel, dt);
    this.pos = add(this.pos, moved);
    return length(moved);
  }
}
