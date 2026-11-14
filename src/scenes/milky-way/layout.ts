import * as THREE from 'three';

/**
 * The galaxy's shape, in thousands of light-years (kly), from the figures on the Milky Way's info
 * card (src/content/bodies/milky-way.ts). galaxy.frag gets these as uniforms.
 */
export const GALAXY = {
  /** Stellar disk ~100,000 ly across. */
  diskRadius: 50,
  /** Bar ~27,000 ly long. */
  barHalfLength: 13.5,
  /** Sun ~27,000 ly from the centre. */
  sunRadius: 27,
  /** The Sun sits on the +Z axis of the galaxy's own frame. */
  sunAngle: Math.PI / 2,
  /** The bar points ~45° away from the Sun–centre line. */
  barAngle: Math.PI / 2 - Math.PI / 4,
  /** Spiral arm pitch angle (published values are mostly 10–15°). */
  pitch: (13 * Math.PI) / 180,
} as const;

/**
 * Where a point fixed in the galaxy (radius, angle in the galaxy's own frame) is in the world after
 * the galaxy has turned by `turned` radians. Matches rot(p.xz, uAngle) in galaxy.frag.
 */
export function galaxyToWorld(
  radius: number,
  angle: number,
  turned: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const a = angle - turned;
  return out.set(radius * Math.cos(a), 0, radius * Math.sin(a));
}
