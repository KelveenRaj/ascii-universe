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

/**
 * The rotation that points the local −Z axis along `forward` with local +Y as close to `up` as it
 * can be (a camera-style look rotation). `forward` must be non-zero and not parallel to `up`.
 */
export function quatLookAt(forward: Vec3d, up: Vec3d): Quat {
  const z = normalize(scale(forward, -1)); // local +Z points backwards
  let x = cross(up, z);
  if (length(x) < 1e-9) x = cross([1, 0, 0], z); // looking straight up or down
  x = normalize(x);
  const y = cross(z, x);
  // rotation matrix with columns x, y, z → quaternion
  const [m00, m10, m20] = x;
  const [m01, m11, m21] = y;
  const [m02, m12, m22] = z;
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return quatNormalize(q);
}

/** Part way (t = 0…1) from rotation a to b, the short way round (normalised lerp: fine for easing). */
export function quatNlerp(a: Quat, b: Quat, t: number): Quat {
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  return quatNormalize([
    a[0] + (sign * b[0] - a[0]) * t,
    a[1] + (sign * b[1] - a[1]) * t,
    a[2] + (sign * b[2] - a[2]) * t,
    a[3] + (sign * b[3] - a[3]) * t,
  ]);
}
