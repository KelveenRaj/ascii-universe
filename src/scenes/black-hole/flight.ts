import * as THREE from 'three';
import { advance, launch, type Orbit, type OrbitEvent } from '@/scenes/black-hole/orbit';

/** Fastest a ship may go after a burn (fraction of c, measured by a hovering observer). */
const MAX_SPEED = 0.98;

const tmp = new THREE.Vector3();

/**
 * A ship's free fall around the hole in full 3D, built on the planar orbits of orbit.ts.
 *
 * A Schwarzschild orbit always stays in one plane through the centre, so a 3D flight is a planar
 * Orbit plus the plane's basis: e1 points at φ = 0 and e2 at φ = 90°, both in world space (the
 * hole at the origin, the disk in the XZ plane). Velocities are 3-velocities measured by an observer
 * hovering at the ship's radius, as fractions of c.
 *
 * Burns change the local velocity and relaunch the orbit from the same point (a new plane if the
 * burn leaves the old one), keeping both clocks. The velocities add as plain vectors, which is
 * close enough for the small kicks a burn gives over one frame.
 */
export class Flight {
  orbit!: Orbit;
  /** World direction of φ = 0 in the orbit plane. */
  readonly e1 = new THREE.Vector3();
  /** World direction of φ = 90° in the orbit plane. */
  readonly e2 = new THREE.Vector3();

  /** Starts at world `position` with local velocity `velocity` (|v| < 1). */
  constructor(position: THREE.Vector3, velocity: THREE.Vector3) {
    this.relaunch(position, velocity, 0, 0);
  }

  get r(): number {
    return this.orbit.r;
  }

  /** Outside (coordinate) time, r_s/c. */
  get t(): number {
    return this.orbit.t;
  }

  /** The ship's own clock, r_s/c. */
  get tau(): number {
    return this.orbit.tau;
  }

  /** Normal of the orbit plane (e1 × e2). */
  normal(out: THREE.Vector3): THREE.Vector3 {
    return out.crossVectors(this.e1, this.e2);
  }

  position(out: THREE.Vector3): THREE.Vector3 {
    const { r, phi } = this.orbit;
    return out
      .copy(this.e1)
      .multiplyScalar(r * Math.cos(phi))
      .addScaledVector(this.e2, r * Math.sin(phi));
  }

  /** Local velocity (fraction of c) as a hovering observer at the ship's radius measures it. */
  velocity(out: THREE.Vector3): THREE.Vector3 {
    const { r, vr, phi, E, L } = this.orbit;
    const lapse = Math.sqrt(Math.max(1e-12, 1 - 1 / r));
    const gamma = E / lapse;
    const radial = vr / (gamma * lapse);
    const tangential = L / (gamma * r);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    // radial unit = c·e1 + s·e2, tangential unit = −s·e1 + c·e2
    return out
      .copy(this.e1)
      .multiplyScalar(radial * c - tangential * s)
      .addScaledVector(this.e2, radial * s + tangential * c);
  }

  /** Adds `dv` (local, fraction of c) to the velocity: an engine burn. */
  burn(dv: THREE.Vector3): void {
    const pos = this.position(new THREE.Vector3());
    const vel = this.velocity(new THREE.Vector3()).add(dv);
    const speed = vel.length();
    if (speed > MAX_SPEED) vel.multiplyScalar(MAX_SPEED / speed);
    this.relaunch(pos, vel, this.orbit.t, this.orbit.tau);
  }

  /** Advances the outside clock by `dt` (see orbit.ts `advance`). */
  advance(dt: number, onStep?: (flight: Flight) => void): OrbitEvent {
    return advance(this.orbit, dt, onStep && (() => onStep(this)));
  }

  private relaunch(position: THREE.Vector3, velocity: THREE.Vector3, t: number, tau: number) {
    const r0 = position.length();
    this.e1.copy(position).divideScalar(r0);
    const along = velocity.dot(this.e1);
    // the part of the velocity across the radial line picks the plane
    tmp.copy(velocity).addScaledVector(this.e1, -along);
    const across = tmp.length();
    if (across > 1e-9) {
      this.e2.copy(tmp).divideScalar(across);
    } else {
      // straight in or out: any plane through the radial line will do
      const helper =
        Math.abs(this.e1.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      this.e2.crossVectors(helper, this.e1).normalize();
    }
    const speed = Math.hypot(along, across);
    this.orbit = launch(r0, 0, speed, Math.atan2(across, along));
    this.orbit.t = t;
    this.orbit.tau = tau;
  }
}
