import * as THREE from 'three';
import type { EngineId, HullId, ShipDesign, WingsId } from '@/world/ship/design';

/**
 * Your ship as a low-poly mesh, built from the hangar parts: a hull, a pair of wings and an
 * engine. About one unit long, nose towards −Z and up +Y (the same axes as FlightModel's forward
 * and up), so the flight's orientation can be used as the mesh's rotation as it is.
 *
 * Every triangle belongs to one of three parts, each painted from its own palette row: the hull
 * (the ship's colour), trim (cockpit, pods, nacelles) and glow (engine nozzles). They're stored as
 * geometry groups in that order, and as an `aPart` attribute (0, 1, 2) so one draw call does all.
 * Normals are per face, for the flat-shaded look.
 */

export const PART_HULL = 0;
export const PART_TRIM = 1;
export const PART_GLOW = 2;
type Part = typeof PART_HULL | typeof PART_TRIM | typeof PART_GLOW;

export const HULL_LABELS: Record<HullId, string> = {
  dart: 'DART',
  arrow: 'ARROW',
  hauler: 'HAULER',
  saucer: 'SAUCER',
};
export const WING_LABELS: Record<WingsId, string> = {
  swept: 'SWEPT',
  delta: 'DELTA',
  stub: 'STUB',
  ring: 'RING',
};
export const ENGINE_LABELS: Record<EngineId, string> = {
  ion: 'ION',
  twin: 'TWIN',
  fusion: 'FUSION',
  sail: 'SAIL',
};

type V = readonly [number, number, number];

/** An engine nozzle, where the exhaust comes out (along +Z), in model units. */
export interface Nozzle {
  pos: V;
  radius: number;
}

export interface ShipModel {
  /** position, normal, aPart; groups 0 hull, 1 trim, 2 glow. */
  geometry: THREE.BufferGeometry;
  nozzles: Nozzle[];
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mid = (...ps: V[]): V => {
  const s = [0, 0, 0];
  for (const p of ps) for (let k = 0; k < 3; k++) s[k] += p[k] / ps.length;
  return s as unknown as V;
};

/**
 * Collects triangles per part. Every primitive passes a point inside itself, and each triangle is
 * wound so its normal points away from that point: the parts are (near enough) convex, so that is
 * outwards, and nothing has to be wound by hand.
 */
class Builder {
  private readonly tris: number[][] = [[], [], []];
  private readonly norms: number[][] = [[], [], []];

  tri(part: Part, a: V, b: V, c: V, inside: V): void {
    let n = cross(sub(b, a), sub(c, a));
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-10) return; // degenerate (a cone's tip)
    n = [n[0] / len, n[1] / len, n[2] / len];
    if (dot(n, sub(mid(a, b, c), inside)) < 0) {
      [b, c] = [c, b];
      n = [-n[0], -n[1], -n[2]];
    }
    this.tris[part].push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.norms[part].push(...n);
  }

  quad(part: Part, a: V, b: V, c: V, d: V, inside: V): void {
    this.tri(part, a, b, c, inside);
    this.tri(part, a, c, d, inside);
  }

  /**
   * Joins rings of points (all the same length, going round the same way) into a closed tube,
   * capped at both ends unless a ring is a single point repeated. `centres[i]` is inside ring i.
   */
  loft(part: Part, rings: V[][], centres: V[], caps = true): void {
    const n = rings[0].length;
    for (let r = 0; r + 1 < rings.length; r++) {
      const inside = mid(centres[r], centres[r + 1]);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.quad(part, rings[r][i], rings[r][j], rings[r + 1][j], rings[r + 1][i], inside);
      }
    }
    if (!caps) return;
    const ends: Array<[number, number]> = [
      [0, 1],
      [rings.length - 1, rings.length - 2],
    ];
    for (const [end, next] of ends) {
      // the cap's inside is a little way towards the next ring
      const inside = mid(centres[end], centres[end], centres[end], centres[next]);
      for (let i = 0; i < n; i++) {
        this.tri(part, centres[end], rings[end][i], rings[end][(i + 1) % n], inside);
      }
    }
  }

  /** An axis-aligned box. */
  box(part: Part, lo: V, hi: V): void {
    const p = (x: number, y: number, z: number): V => [
      x ? hi[0] : lo[0],
      y ? hi[1] : lo[1],
      z ? hi[2] : lo[2],
    ];
    const c = mid(lo, hi);
    const faces: Array<[V, V, V, V]> = [
      [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0)],
      [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
      [p(0, 0, 0), p(0, 1, 0), p(0, 1, 1), p(0, 0, 1)],
      [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)],
      [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)],
      [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)],
    ];
    for (const [a, b, cc, d] of faces) this.quad(part, a, b, cc, d, c);
  }

  /** A flat plate: an outline in the XZ plane (convex, in order), `thick` deep, centred on `y`. */
  plate(part: Part, outline: Array<[number, number]>, y: number, thick: number): void {
    const top = outline.map(([x, z]): V => [x, y + thick / 2, z]);
    const bottom = outline.map(([x, z]): V => [x, y - thick / 2, z]);
    const c = mid(...top, ...bottom);
    for (let i = 1; i + 1 < outline.length; i++) {
      this.tri(part, top[0], top[i], top[i + 1], c);
      this.tri(part, bottom[0], bottom[i], bottom[i + 1], c);
    }
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      this.quad(part, top[i], top[j], bottom[j], bottom[i], c);
    }
  }

  /** A plate standing upright: an outline in the ZY plane at `x`. */
  fin(part: Part, outline: Array<[number, number]>, x: number, thick: number): void {
    const a = outline.map(([z, y]): V => [x - thick / 2, y, z]);
    const b = outline.map(([z, y]): V => [x + thick / 2, y, z]);
    const c = mid(...a, ...b);
    for (let i = 1; i + 1 < outline.length; i++) {
      this.tri(part, a[0], a[i], a[i + 1], c);
      this.tri(part, b[0], b[i], b[i + 1], c);
    }
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      this.quad(part, a[i], a[j], b[j], b[i], c);
    }
  }

  /** A disc facing +Z (a glowing nozzle). */
  disc(part: Part, at: V, radius: number, sides = 8): void {
    const ring = circleZ(at, radius, radius, sides);
    const inside: V = [at[0], at[1], at[2] - 0.01];
    for (let i = 0; i < sides; i++) this.tri(part, at, ring[i], ring[(i + 1) % sides], inside);
  }

  /** Scales everything so the ship spans exactly one unit along Z, centred on the origin. */
  build(nozzles: Nozzle[]): ShipModel {
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const list of this.tris) {
      for (let i = 2; i < list.length; i += 3) {
        zMin = Math.min(zMin, list[i]);
        zMax = Math.max(zMax, list[i]);
      }
    }
    const k = 1 / (zMax - zMin);
    const zc = (zMin + zMax) / 2;
    const fit = (x: number, y: number, z: number): V => [x * k, y * k, (z - zc) * k];

    const positions: number[] = [];
    const normals: number[] = [];
    const parts: number[] = [];
    const geometry = new THREE.BufferGeometry();
    let start = 0;
    for (let part = 0; part < 3; part++) {
      const list = this.tris[part];
      for (let i = 0; i < list.length; i += 3)
        positions.push(...fit(list[i], list[i + 1], list[i + 2]));
      normals.push(...this.norms[part]);
      const count = list.length / 3;
      for (let i = 0; i < count; i++) parts.push(part);
      geometry.addGroup(start, count, part);
      start += count;
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return {
      geometry,
      nozzles: nozzles.map((n) => ({ pos: fit(...n.pos), radius: n.radius * k })),
    };
  }
}

/** A ring round the Z axis direction at `c`: `w` half-width, `h` half-height, first point on top. */
function circleZ(c: V, w: number, h: number, sides: number, turn = 0): V[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = turn + (i / sides) * Math.PI * 2;
    return [c[0] + Math.sin(a) * w, c[1] + Math.cos(a) * h, c[2]] as V;
  });
}

/** A ring round the Y axis at `c` (the saucer's sections), first point towards −Z (the nose). */
function circleY(c: V, r: number, sides: number): V[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [c[0] + Math.sin(a) * r, c[1], c[2] - Math.cos(a) * r] as V;
  });
}

/** A fuselage along Z: sections [z, y, half-width, half-height], nose first. */
function fuselage(b: Builder, part: Part, sections: number[][], sides: number, turn = 0): void {
  const centres = sections.map(([z, y]): V => [0, y, z]);
  const rings = sections.map(([z, y, w, h]) => circleZ([0, y, z], w, h, sides, turn));
  b.loft(part, rings, centres);
}

/** A round tube along Z: sections [z, radius], at (x, y). */
function tube(b: Builder, part: Part, x: number, y: number, sections: number[][], sides = 8): void {
  const centres = sections.map(([z]): V => [x, y, z]);
  const rings = sections.map(([z, r]) => circleZ([x, y, z], r, r, sides));
  b.loft(part, rings, centres);
}

/** What a hull leaves for the other parts to hang off. */
interface HullFit {
  /** Half-width where the wings join. */
  side: number;
  /** Where the hull ends at the back (+Z). */
  tail: number;
  /** Height of the hull's centre line at the back. */
  y: number;
}

function buildHull(b: Builder, hull: HullId): HullFit {
  switch (hull) {
    case 'dart': {
      // a slim six-sided fuselage with a canopy
      fuselage(
        b,
        PART_HULL,
        [
          [-0.5, 0, 0, 0],
          [-0.32, 0, 0.06, 0.05],
          [-0.05, 0, 0.1, 0.085],
          [0.25, 0, 0.1, 0.08],
          [0.38, 0, 0.085, 0.07],
        ],
        6,
      );
      fuselage(
        b,
        PART_TRIM,
        [
          [-0.28, 0.04, 0.02, 0.015],
          [-0.18, 0.07, 0.045, 0.035],
          [-0.02, 0.07, 0.045, 0.03],
          [0.06, 0.05, 0.02, 0.015],
        ],
        6,
      );
      return { side: 0.08, tail: 0.38, y: 0 };
    }
    case 'arrow': {
      // a long, flat wedge with a dorsal fin
      fuselage(
        b,
        PART_HULL,
        [
          [-0.58, 0, 0, 0],
          [-0.3, 0, 0.08, 0.045],
          [0.05, 0, 0.14, 0.065],
          [0.38, 0, 0.12, 0.055],
        ],
        4,
      );
      b.fin(
        PART_TRIM,
        [
          [0.05, 0.05],
          [0.34, 0.05],
          [0.38, 0.19],
          [0.27, 0.19],
        ],
        0,
        0.02,
      );
      fuselage(
        b,
        PART_TRIM,
        [
          [-0.3, 0.03, 0.015, 0.01],
          [-0.2, 0.055, 0.035, 0.025],
          [-0.05, 0.05, 0.035, 0.02],
        ],
        4,
      );
      return { side: 0.1, tail: 0.38, y: 0 };
    }
    case 'hauler': {
      // a boxy freighter: blunt nose, square body, cargo pods down both sides
      fuselage(
        b,
        PART_HULL,
        [
          [-0.46, 0, 0.11, 0.09],
          [-0.36, 0, 0.17, 0.15],
          [0.3, 0, 0.17, 0.15],
          [0.4, 0, 0.14, 0.12],
        ],
        4,
        Math.PI / 4,
      );
      for (const s of [1, -1]) b.box(PART_TRIM, [s * 0.14, -0.08, -0.22], [s * 0.22, 0.04, 0.22]);
      b.box(PART_TRIM, [-0.06, 0.1, -0.42], [0.06, 0.15, -0.3]); // the bridge
      return { side: 0.17, tail: 0.4, y: 0 };
    }
    case 'saucer': {
      // a disc with a dome, and a short prow so you can tell which way it flies
      const sections: Array<[number, number]> = [
        [-0.05, 0.28],
        [0, 0.42],
        [0.035, 0.36],
      ];
      const sides = 16;
      b.loft(
        PART_HULL,
        sections.map(([y, r]) => circleY([0, y, 0], r, sides)),
        sections.map(([y]): V => [0, y, 0]),
      );
      const dome: Array<[number, number]> = [
        [0.03, 0.18],
        [0.09, 0.14],
        [0.12, 0.05],
      ];
      b.loft(
        PART_TRIM,
        dome.map(([y, r]) => circleY([0, y, 0], r, 8)),
        dome.map(([y]): V => [0, y, 0]),
      );
      fuselage(
        b,
        PART_TRIM,
        [
          [-0.52, 0, 0, 0],
          [-0.36, 0, 0.04, 0.025],
        ],
        4,
      );
      return { side: 0.24, tail: 0.38, y: 0 };
    }
  }
}

function buildWings(b: Builder, wings: WingsId, fit: HullFit): void {
  const root = fit.side - 0.02;
  const t = fit.tail;
  const both = (outline: Array<[number, number]>, part: Part, y = 0, thick = 0.02) => {
    for (const s of [1, -1]) {
      const o = outline.map(([x, z]): [number, number] => [s * (root + x), z]);
      b.plate(part, s > 0 ? o : o.reverse(), y, thick);
    }
  };
  switch (wings) {
    case 'swept':
      both(
        [
          [0, t - 0.4],
          [0.34, t - 0.08],
          [0.34, t + 0.0],
          [0, t - 0.06],
        ],
        PART_HULL,
      );
      // wingtip pods
      for (const s of [1, -1]) {
        const x = s * (root + 0.34);
        tube(
          b,
          PART_TRIM,
          x,
          0,
          [
            [t - 0.16, 0.012],
            [t - 0.12, 0.022],
            [t + 0.02, 0.022],
          ],
          6,
        );
      }
      return;
    case 'delta':
      both(
        [
          [0, t - 0.6],
          [0.3, t],
          [0, t],
        ],
        PART_HULL,
        -0.01,
        0.025,
      );
      // fins at the trailing corners
      for (const s of [1, -1]) {
        b.fin(
          PART_TRIM,
          [
            [t - 0.12, 0],
            [t, 0],
            [t, 0.12],
            [t - 0.04, 0.12],
          ],
          s * (root + 0.24),
          0.015,
        );
      }
      return;
    case 'stub':
      both(
        [
          [0, t - 0.3],
          [0.16, t - 0.22],
          [0.16, t - 0.1],
          [0, t - 0.06],
        ],
        PART_HULL,
      );
      // canards near the nose, and a weapon-pod look at the tips
      both(
        [
          [0, -0.3],
          [0.07, -0.24],
          [0.07, -0.2],
          [0, -0.18],
        ],
        PART_TRIM,
        0,
        0.015,
      );
      for (const s of [1, -1])
        b.box(PART_TRIM, [s * (root + 0.14), -0.03, t - 0.3], [s * (root + 0.2), 0.03, t - 0.06]);
      return;
    case 'ring': {
      // a band all round the hull, on four struts
      const radius = root + 0.2;
      const z0 = t - 0.24;
      const z1 = t - 0.08;
      const sides = 16;
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const pt = (a: number, r: number, z: number): V => [Math.sin(a) * r, Math.cos(a) * r, z];
        const ri = radius - 0.025;
        const am = (a0 + a1) / 2;
        // outer and inner faces, and the two rims
        b.quad(
          PART_HULL,
          pt(a0, radius, z0),
          pt(a1, radius, z0),
          pt(a1, radius, z1),
          pt(a0, radius, z1),
          pt(am, ri, (z0 + z1) / 2),
        );
        b.quad(
          PART_HULL,
          pt(a0, ri, z0),
          pt(a1, ri, z0),
          pt(a1, ri, z1),
          pt(a0, ri, z1),
          pt(am, radius, (z0 + z1) / 2),
        );
        b.quad(
          PART_HULL,
          pt(a0, radius, z0),
          pt(a1, radius, z0),
          pt(a1, ri, z0),
          pt(a0, ri, z0),
          pt(am, (radius + ri) / 2, z1),
        );
        b.quad(
          PART_HULL,
          pt(a0, radius, z1),
          pt(a1, radius, z1),
          pt(a1, ri, z1),
          pt(a0, ri, z1),
          pt(am, (radius + ri) / 2, z0),
        );
      }
      // struts, diagonally (an X seen from behind)
      for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
        const dir: V = [Math.sin(a), Math.cos(a), 0];
        const nrm: V = [Math.cos(a), -Math.sin(a), 0];
        const w = 0.008;
        const p = (r: number, z: number, s: number): V => [
          dir[0] * r + nrm[0] * s * w,
          dir[1] * r + nrm[1] * s * w,
          z,
        ];
        const r0 = 0.04;
        const r1 = radius - 0.02;
        const zs = z0 + 0.02;
        const ze = z1 - 0.02;
        const c: V = [(dir[0] * (r0 + r1)) / 2, (dir[1] * (r0 + r1)) / 2, (zs + ze) / 2];
        b.quad(PART_TRIM, p(r0, zs, 1), p(r1, zs, 1), p(r1, ze, 1), p(r0, ze, 1), c);
        b.quad(PART_TRIM, p(r0, zs, -1), p(r1, zs, -1), p(r1, ze, -1), p(r0, ze, -1), c);
        b.quad(PART_TRIM, p(r0, zs, 1), p(r1, zs, 1), p(r1, zs, -1), p(r0, zs, -1), c);
        b.quad(PART_TRIM, p(r0, ze, 1), p(r1, ze, 1), p(r1, ze, -1), p(r0, ze, -1), c);
      }
      return;
    }
  }
}

function buildEngine(b: Builder, engine: EngineId, fit: HullFit): Nozzle[] {
  const t = fit.tail;
  const y = fit.y;
  switch (engine) {
    case 'ion': {
      tube(b, PART_TRIM, 0, y, [
        [t - 0.06, 0.065],
        [t + 0.1, 0.07],
        [t + 0.14, 0.06],
      ]);
      const at: V = [0, y, t + 0.141];
      b.disc(PART_GLOW, at, 0.05);
      return [{ pos: at, radius: 0.05 }];
    }
    case 'twin': {
      const out: Nozzle[] = [];
      for (const s of [1, -1]) {
        const x = s * 0.085;
        tube(b, PART_TRIM, x, y, [
          [t - 0.22, 0.03],
          [t - 0.16, 0.045],
          [t + 0.1, 0.045],
          [t + 0.13, 0.04],
        ]);
        const at: V = [x, y, t + 0.131];
        b.disc(PART_GLOW, at, 0.033);
        out.push({ pos: at, radius: 0.033 });
      }
      return out;
    }
    case 'fusion': {
      // a big bell nozzle with a collar
      tube(
        b,
        PART_TRIM,
        0,
        y,
        [
          [t - 0.08, 0.06],
          [t + 0.02, 0.065],
          [t + 0.18, 0.11],
        ],
        10,
      );
      tube(
        b,
        PART_HULL,
        0,
        y,
        [
          [t - 0.02, 0.08],
          [t + 0.03, 0.08],
        ],
        10,
      );
      const at: V = [0, y, t + 0.181];
      b.disc(PART_GLOW, at, 0.095, 10);
      return [{ pos: at, radius: 0.095 }];
    }
    case 'sail': {
      // a small drive, and a light sail spread behind on four spars
      tube(b, PART_TRIM, 0, y, [
        [t - 0.04, 0.04],
        [t + 0.06, 0.04],
      ]);
      const at: V = [0, y, t + 0.061];
      b.disc(PART_GLOW, at, 0.03);
      const z = t + 0.2;
      const r = 0.3;
      const sail: V[] = [
        [0, y + r, z],
        [r, y, z],
        [0, y - r, z],
        [-r, y, z],
      ];
      const inside: V = [0, y, z - 0.01];
      b.tri(PART_HULL, sail[0], sail[1], sail[2], inside);
      b.tri(PART_HULL, sail[0], sail[2], sail[3], inside);
      const back: V[] = sail.map((p): V => [p[0], p[1], p[2] + 0.008]);
      const inside2: V = [0, y, z + 0.02];
      b.tri(PART_HULL, back[0], back[1], back[2], inside2);
      b.tri(PART_HULL, back[0], back[2], back[3], inside2);
      for (const corner of sail) {
        const spar: V = [corner[0] * 0.98, corner[1] * 0.98 + y * 0.02, z];
        const base: V = [corner[0] * 0.1, y + (corner[1] - y) * 0.1, t + 0.04];
        const off: V = [0.006, 0.006, 0];
        b.quad(
          PART_TRIM,
          base,
          spar,
          [spar[0] + off[0], spar[1] + off[1], spar[2]],
          [base[0] + off[0], base[1] + off[1], base[2]],
          [0, y, z + 1],
        );
      }
      return [{ pos: at, radius: 0.03 }];
    }
  }
}

const cache = new Map<string, ShipModel>();

/** The mesh for a design's hull, wings and engine (colours and names don't change it). Cached. */
export function shipModel(design: Pick<ShipDesign, 'hull' | 'wings' | 'engine'>): ShipModel {
  const key = `${design.hull}/${design.wings}/${design.engine}`;
  let model = cache.get(key);
  if (!model) {
    const b = new Builder();
    const fit = buildHull(b, design.hull);
    buildWings(b, design.wings, fit);
    const nozzles = buildEngine(b, design.engine, fit);
    model = b.build(nozzles);
    cache.set(key, model);
  }
  return model;
}

/**
 * The exhaust: a cone out of each nozzle along +Z, one unit long before the shader stretches it
 * (`aT` 0 at the nozzle, 1 at the tip). Cached with the model.
 */
const exhaustCache = new Map<ShipModel, THREE.BufferGeometry>();

export function exhaustGeometry(model: ShipModel, sides = 8): THREE.BufferGeometry {
  let g = exhaustCache.get(model);
  if (g) return g;
  const pos: number[] = [];
  const t: number[] = [];
  for (const { pos: p, radius } of model.nozzles) {
    const ring = circleZ(p, radius * 0.9, radius * 0.9, sides);
    for (let i = 0; i < sides; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % sides];
      pos.push(...a, ...b, p[0], p[1], p[2]);
      t.push(0, 0, 1);
    }
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  exhaustCache.set(model, g);
  return g;
}
