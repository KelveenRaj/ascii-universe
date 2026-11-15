/**
 * Small float64 vector and quaternion helpers for the open world. Positions live here on the CPU in
 * full double precision; shaders only ever see camera-relative float32 values, so nothing needs a
 * floating origin. Plain tuples (not THREE.Vector3) so they serialise straight into saves.
 */
export type Vec3d = readonly [number, number, number];
/** Unit quaternion as [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

export const ZERO: Vec3d = [0, 0, 0];
export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export const add = (a: Vec3d, b: Vec3d): Vec3d => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3d, b: Vec3d): Vec3d => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3d, s: number): Vec3d => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3d, b: Vec3d): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3d, b: Vec3d): Vec3d => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3d): number => Math.hypot(a[0], a[1], a[2]);
export const distance = (a: Vec3d, b: Vec3d): number => length(sub(a, b));

/** `a` scaled to unit length; the zero vector stays zero. */
export function normalize(a: Vec3d): Vec3d {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : ZERO;
}

/** Rotation of `angle` radians about the unit vector `axis`. */
export function quatFromAxisAngle(axis: Vec3d, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

/** a·b: rotate by b, then by a. */
export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** `q` scaled to unit length (identity if it has none), so drift from repeated products can't build up. */
export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return l > 0 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : QUAT_IDENTITY;
}

/** `v` rotated by the unit quaternion `q`. */
export function rotate(q: Quat, v: Vec3d): Vec3d {
  const [x, y, z, w] = q;
  // t = 2·(q.xyz × v); v' = v + w·t + q.xyz × t
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

export const isFiniteVec = (v: unknown): v is Vec3d =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

export const isFiniteQuat = (q: unknown): q is Quat =>
  Array.isArray(q) && q.length === 4 && q.every((n) => typeof n === 'number' && Number.isFinite(n));
