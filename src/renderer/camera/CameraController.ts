import * as THREE from 'three';

const DEG = Math.PI / 180;

export interface CameraPose {
  /** Rotation around the world Y axis (the disk normal), radians. */
  yaw: number;
  /** Angle above the disk plane, radians, clamped to ±90°. Inclination = 90° − elevation. */
  elevation: number;
  /** Distance from the orbit target, in Schwarzschild radii. */
  distance: number;
  /** Rotation around the view axis, radians. Positive turns the image clockwise. */
  roll: number;
  /** Orbit centre. Starts at the black hole; panning moves it. */
  target: THREE.Vector3;
}

export const VIEW_PRESETS = {
  /** ~80° inclination: disk nearly edge-on, far side arcing over and under the shadow. */
  interstellar: { elevation: 10, yaw: 0, distance: 26 },
  /** ~17° inclination: M87*'s viewing angle, the EHT ring. */
  eht: { elevation: 73, yaw: 0, distance: 26 },
  topDown: { elevation: 90, yaw: 0, distance: 30 },
} as const;
export type ViewPreset = keyof typeof VIEW_PRESETS;

export const CAMERA_LIMITS = {
  /** Just outside the photon sphere (1.5) and the shader's camera-outside assumption. */
  minDistance: 2.6,
  maxDistance: 120,
  maxElevation: 90 * DEG,
  /** Panning can't drift the orbit centre further than this from the hole. */
  maxTargetRadius: 30,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Wraps an angle difference into (−π, π]. */
const wrapAngle = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/**
 * Orbit camera with pan and roll. Input writes *goal* values; update() eases the current pose toward
 * them with exponential smoothing, which behaves the same at any frame rate. No DOM here.
 *
 * Orientation q = yaw(Y) · elevation(X) · roll(Z); the camera sits at target + q·(0, 0, distance)
 * and looks down its local −Z, i.e. at the target. Quaternions mean no gimbal flip at the poles.
 */
export class CameraController {
  readonly current: CameraPose;
  readonly goal: CameraPose;
  /** Smoothing rate (1/s). Higher is snappier. */
  damping = 10;
  attractEnabled = true;
  /** Seconds without input before the attract-mode orbit starts. */
  attractDelay = 30;
  /** Attract-mode orbit speed, radians per second. */
  attractSpeed = 0.08;

  private tanHalfFov: number;
  private idleTime = 0;
  private readonly q = new THREE.Quaternion();
  private readonly qTmp = new THREE.Quaternion();
  private readonly vTmp = new THREE.Vector3();

  constructor(tanHalfFov: number, preset: ViewPreset = 'interstellar') {
    this.tanHalfFov = tanHalfFov;
    const p = VIEW_PRESETS[preset];
    const pose = (): CameraPose => ({
      yaw: p.yaw * DEG,
      elevation: p.elevation * DEG,
      distance: p.distance,
      roll: 0,
      target: new THREE.Vector3(),
    });
    this.current = pose();
    this.goal = pose();
  }

  setFov(tanHalfFov: number): void {
    this.tanHalfFov = tanHalfFov;
  }

  get attractActive(): boolean {
    return this.attractEnabled && this.idleTime >= this.attractDelay;
  }

  /** Call on any user input: stops attract mode and restarts the idle timer. */
  notifyInput(): void {
    this.idleTime = 0;
  }

  /** Orbit by world yaw / elevation deltas (radians). */
  orbit(dYaw: number, dElevation: number): void {
    this.goal.yaw += dYaw;
    this.goal.elevation = clamp(
      this.goal.elevation + dElevation,
      -CAMERA_LIMITS.maxElevation,
      CAMERA_LIMITS.maxElevation,
    );
    this.notifyInput();
  }

  /**
   * Orbit from a screen drag (DOM convention: +x right, +y down), in radians of drag. The delta is
   * rotated by the current roll so the scene always follows the pointer, even when rolled.
   */
  orbitScreen(dx: number, dy: number): void {
    const c = Math.cos(this.current.roll);
    const s = Math.sin(this.current.roll);
    const rx = dx * c + dy * s;
    const ry = -dx * s + dy * c;
    this.orbit(-rx, ry);
  }

  /** Multiplies the goal distance (factor < 1 zooms in). */
  zoom(factor: number): void {
    if (!(factor > 0)) return;
    this.goal.distance = clamp(
      this.goal.distance * factor,
      CAMERA_LIMITS.minDistance,
      CAMERA_LIMITS.maxDistance,
    );
    this.notifyInput();
  }

  /**
   * Pans so the scene follows a screen drag. dx, dy are in viewport heights (DOM convention), so
   * the point under the cursor at the target's depth stays under the cursor.
   */
  pan(dx: number, dy: number): void {
    const worldPerHeight = 2 * this.tanHalfFov * this.current.distance;
    this.orientation(this.q, this.current);
    const right = this.vTmp
      .copy(AXIS_X)
      .applyQuaternion(this.q)
      .multiplyScalar(-dx * worldPerHeight);
    this.goal.target.add(right);
    const up = this.vTmp
      .copy(AXIS_Y)
      .applyQuaternion(this.q)
      .multiplyScalar(dy * worldPerHeight);
    this.goal.target.add(up);
    if (this.goal.target.length() > CAMERA_LIMITS.maxTargetRadius) {
      this.goal.target.setLength(CAMERA_LIMITS.maxTargetRadius);
    }
    this.notifyInput();
  }

  /** Positive rolls the image clockwise. */
  rollBy(dRoll: number): void {
    this.goal.roll += dRoll;
    this.notifyInput();
  }

  /** Eases to a preset (shortest way round), re-centres and levels the horizon. */
  setPreset(name: ViewPreset, instant = false): void {
    const p = VIEW_PRESETS[name];
    this.goal.yaw = this.current.yaw + wrapAngle(p.yaw * DEG - this.current.yaw);
    this.goal.elevation = p.elevation * DEG;
    this.goal.distance = p.distance;
    this.goal.roll = this.current.roll + wrapAngle(-this.current.roll);
    this.goal.target.set(0, 0, 0);
    this.notifyInput();
    if (instant) this.snap();
  }

  reset(): void {
    this.setPreset('interstellar');
  }

  /** Jumps the current pose to the goal (no easing). */
  snap(): void {
    const { current: c, goal: g } = this;
    c.yaw = g.yaw;
    c.elevation = g.elevation;
    c.distance = g.distance;
    c.roll = g.roll;
    c.target.copy(g.target);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.idleTime += dt;
    if (this.attractActive) this.goal.yaw += this.attractSpeed * dt;

    const k = 1 - Math.exp(-this.damping * dt);
    const { current: c, goal: g } = this;
    c.yaw += (g.yaw - c.yaw) * k;
    c.elevation += (g.elevation - c.elevation) * k;
    c.roll += (g.roll - c.roll) * k;
    // ease distance in log space so zooming feels even at every scale
    c.distance = Math.exp(Math.log(c.distance) + (Math.log(g.distance) - Math.log(c.distance)) * k);
    c.target.lerp(g.target, k);
  }

  /** Orientation quaternion for a pose. */
  orientation(out: THREE.Quaternion, pose: CameraPose = this.current): THREE.Quaternion {
    out.setFromAxisAngle(AXIS_Y, pose.yaw);
    out.multiply(this.qTmp.setFromAxisAngle(AXIS_X, -pose.elevation));
    out.multiply(this.qTmp.setFromAxisAngle(AXIS_Z, pose.roll));
    return out;
  }

  /** World position for a pose. */
  position(out: THREE.Vector3, pose: CameraPose = this.current): THREE.Vector3 {
    this.orientation(this.q, pose);
    return out.set(0, 0, pose.distance).applyQuaternion(this.q).add(pose.target);
  }

  /** Writes the current pose into `camera` (used purely as a math container for the shader). */
  apply(camera: THREE.PerspectiveCamera): void {
    this.orientation(camera.quaternion, this.current);
    this.position(camera.position, this.current);
    camera.updateMatrixWorld(true);
  }
}
