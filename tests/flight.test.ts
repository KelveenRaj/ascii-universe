import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Flight } from '@/scenes/black-hole/flight';
import { advance, launch } from '@/scenes/black-hole/orbit';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('3D flight', () => {
  it('reports back the position and velocity it was launched with', () => {
    const pos = v3(-15, 6, 4);
    const vel = v3(0.3, -0.1, 0.2);
    const f = new Flight(pos, vel);
    expect(f.position(new THREE.Vector3()).distanceTo(pos)).toBeLessThan(1e-9);
    expect(f.velocity(new THREE.Vector3()).distanceTo(vel)).toBeLessThan(1e-9);
  });

  it('stays in the launch plane and matches the planar orbit', () => {
    const pos = v3(-18, 7, 2);
    const vel = v3(0.4, -0.15, -0.1);
    const f = new Flight(pos, vel);
    const n = pos.clone().cross(vel).normalize();
    // the same orbit in 2D: same radius, speed and angle from the radial direction
    const angle = vel.angleTo(pos);
    const flat = launch(pos.length(), 0, vel.length(), angle);
    f.advance(120);
    advance(flat, 120);
    const p = f.position(new THREE.Vector3());
    expect(Math.abs(p.dot(n))).toBeLessThan(1e-6);
    expect(f.r).toBeCloseTo(flat.r, 6);
    expect(f.tau).toBeCloseTo(flat.tau, 6);
  });

  it('handles a launch straight at the hole', () => {
    const f = new Flight(v3(0, 0, 10), v3(0, 0, -0.2));
    expect(f.advance(200)).toBe('horizon');
  });

  it('a prograde burn speeds the ship up and a sideways burn tilts the plane', () => {
    const f = new Flight(v3(-20, 0, 0), v3(0.1, 0, 0.3));
    const v = f.velocity(new THREE.Vector3());
    const dir = v.clone().normalize();
    const E0 = f.orbit.E;
    f.burn(dir.clone().multiplyScalar(0.05));
    expect(f.velocity(new THREE.Vector3()).length()).toBeCloseTo(v.length() + 0.05, 9);
    expect(f.orbit.E).toBeGreaterThan(E0);

    const n0 = f.normal(new THREE.Vector3());
    // the plane turns about the radial line, by the burn against the across-radius speed
    const radial = f.position(new THREE.Vector3()).normalize();
    const vel = f.velocity(new THREE.Vector3());
    const across = vel.addScaledVector(radial, -vel.dot(radial)).length();
    f.burn(n0.clone().multiplyScalar(0.05));
    const n1 = f.normal(new THREE.Vector3());
    expect(n0.angleTo(n1)).toBeCloseTo(Math.atan2(0.05, across), 6);
  });

  it('keeps both clocks across a burn', () => {
    const f = new Flight(v3(-20, 3, 0), v3(0.2, 0, 0.3));
    f.advance(50);
    const { t, tau } = f;
    f.burn(v3(0, 0.02, 0));
    expect(f.t).toBe(t);
    expect(f.tau).toBe(tau);
  });

  it('caps the speed a burn can reach', () => {
    const f = new Flight(v3(-20, 0, 0), v3(0.9, 0, 0));
    f.burn(v3(0.5, 0, 0));
    expect(f.velocity(new THREE.Vector3()).length()).toBeCloseTo(0.98, 9);
  });
});
