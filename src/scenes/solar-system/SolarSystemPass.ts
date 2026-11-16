import * as THREE from 'three';
import type { SceneLayout } from '@/engine/display/DisplayPipeline';
import type { SceneLabel } from '@/engine/display/labels';
import { FullscreenPass } from '@/engine/FullscreenPass';
import type { SceneFocus, SceneFrame, SceneInstance } from '@/engine/scene/SceneModule';
import {
  AU_KM,
  BODY_COUNT,
  SATURN_RINGS,
  SOLAR_BODIES,
  findSolarBody,
  type SolarBodyId,
} from '@/scenes/solar-system/bodies';
import { PLANET_IDS, orbitPath, type Vec3 } from '@/scenes/solar-system/ephemeris';
import { layoutAt, squeeze, type PlacedBody } from '@/scenes/solar-system/layout';
import { SOLAR_SYSTEM_PARAMS, type SolarSystemParams } from '@/scenes/solar-system/params';
import solarFrag from '@/scenes/solar-system/shaders/solar-system.frag';

type U<T> = THREE.IUniform<T>;

const DAY_MS = 86400000;

/**
 * Geometric albedo (NASA Planetary Fact Sheets), and the mean albedo of each body's map (printed
 * by scripts/planet-maps.mjs; Earth's includes its cloud cover). Brightness on screen is the map
 * scaled to the body's real albedo, so the Moon really is darker than the Earth beside it.
 */
const ALBEDO: Record<SolarBodyId, { real: number; map: number }> = {
  sun: { real: 1, map: 1 },
  mercury: { real: 0.142, map: 0.1155 },
  venus: { real: 0.689, map: 1 },
  earth: { real: 0.434, map: 0.4 },
  moon: { real: 0.12, map: 0.4809 },
  mars: { real: 0.17, map: 0.1307 },
  jupiter: { real: 0.538, map: 0.3647 },
  saturn: { real: 0.499, map: 0.4328 },
  uranus: { real: 0.488, map: 1 },
  neptune: { real: 0.442, map: 1 },
};

/** The material a body shows as when it's smaller than a pixel (materials.ts). */
const POINT_MATERIAL: Record<SolarBodyId, number> = {
  sun: 0,
  mercury: 15,
  venus: 16,
  earth: 2,
  moon: 10,
  mars: 12,
  jupiter: 17,
  saturn: 21,
  uranus: 24,
  neptune: 25,
};

/** How many planet radii away each close-up view sits (Saturn's leaves room for the rings). */
const VIEW_RADII: Partial<Record<SolarBodyId, number>> = { saturn: 6.5, sun: 3.6 };
const ORBIT_POINTS = 120;

/** `?date=YYYY-MM-DD[THH:MM]` (UTC) fixes the starting date; otherwise it's now. */
function startDate(): Date {
  const raw = new URLSearchParams(window.location.search).get('date');
  if (raw && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(raw)) {
    const d = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : `${raw}:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

const maps = new THREE.TextureLoader();
function loadMap(name: string): THREE.Texture {
  const tex = maps.load(`${import.meta.env.BASE_URL}maps/${name}.png`);
  tex.colorSpace = THREE.NoColorSpace; // data, not colour
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** Saturn's rings' optical depth across their width (bodies.ts), as a 1D texture. */
function ringTexture(): { tex: THREE.DataTexture; inner: number; outer: number } {
  const inner = SATURN_RINGS[0].inner;
  const outer = Math.max(...SATURN_RINGS.map((r) => r.outer));
  const n = 1024;
  const data = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const r = inner + ((k + 0.5) / n) * (outer - inner);
    let tau = 0;
    // later entries are gaps inside earlier rings (the Encke Gap in the A ring), so they win
    for (const ring of SATURN_RINGS) if (r >= ring.inner && r < ring.outer) tau = ring.tau;
    data[k * 4] = tau;
  }
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return { tex, inner, outer };
}

const v3 = () => new THREE.Vector3();

/**
 * Draws the Solar System for a date (see shaders/solar-system.frag). Time runs at the `timeRate`
 * param from a starting date (now, or `?date=`). The camera follows whichever body you've gone to.
 */
export class SolarSystemPass implements SceneInstance<SolarSystemParams> {
  private readonly pass: FullscreenPass<{
    uCamBasis: U<THREE.Matrix3>;
    uTanHalfFov: U<number>;
    uAspect: U<number>;
    uPixelAngle: U<number>;
    uTime: U<number>;
    uRedshiftView: U<boolean>;
    uBody: U<THREE.Vector4[]>;
    uFlat: U<number[]>;
    uAxisX: U<THREE.Vector3[]>;
    uAxisY: U<THREE.Vector3[]>;
    uAxisZ: U<THREE.Vector3[]>;
    uGain: U<number[]>;
    uPointMaterial: U<number[]>;
    uSunGlow: U<number>;
    uCorona: U<number>;
    uStarDensity: U<number>;
    uEarth: U<THREE.Texture>;
    uMoon: U<THREE.Texture>;
    uMars: U<THREE.Texture>;
    uMercury: U<THREE.Texture>;
    uJupiter: U<THREE.Texture>;
    uSaturn: U<THREE.Texture>;
    uRings: U<THREE.Texture>;
    uRingRange: U<THREE.Vector2>;
  }>;
  private readonly textures: THREE.Texture[];
  private readonly start = startDate();
  /** Simulated days since the start date. */
  private days = 0;
  private realTime = 0;
  private trueScale = false;
  private placed: Record<SolarBodyId, PlacedBody>;
  private placedKey = '';
  /** Body the camera is on ('solar-system' for the overview). */
  private focusId = 'solar-system';
  private orbits: Array<{ points: THREE.Vector3[] }> = [];
  private orbitsKey = '';
  private readonly labelPos = SOLAR_BODIES.map(v3);

  constructor(tanHalfFov: number) {
    const rings = ringTexture();
    const radiusKm = findSolarBody('saturn')!.radiusKm;
    this.textures = [
      loadMap('earth'),
      loadMap('moon'),
      loadMap('mars'),
      loadMap('mercury'),
      loadMap('jupiter'),
      loadMap('saturn'),
      rings.tex,
    ];
    const [earth, moon, mars, mercury, jupiter, saturn] = this.textures;
    const many = <T>(make: () => T) => Array.from({ length: BODY_COUNT }, make);
    this.pass = new FullscreenPass(solarFrag, {
      uCamBasis: { value: new THREE.Matrix3() },
      uTanHalfFov: { value: tanHalfFov },
      uAspect: { value: 1 },
      uPixelAngle: { value: 0.002 },
      uTime: { value: 0 },
      uRedshiftView: { value: false },
      uBody: { value: many(() => new THREE.Vector4(0, 0, -1e6, 1)) },
      uFlat: { value: many(() => 1) },
      uAxisX: { value: many(() => new THREE.Vector3(1, 0, 0)) },
      uAxisY: { value: many(() => new THREE.Vector3(0, 1, 0)) },
      uAxisZ: { value: many(() => new THREE.Vector3(0, 0, 1)) },
      uGain: { value: many(() => 1) },
      uPointMaterial: { value: SOLAR_BODIES.map((b) => POINT_MATERIAL[b.id]) },
      uSunGlow: { value: 2.4 },
      uCorona: { value: 1 },
      uStarDensity: { value: 0.35 },
      uEarth: { value: earth },
      uMoon: { value: moon },
      uMars: { value: mars },
      uMercury: { value: mercury },
      uJupiter: { value: jupiter },
      uSaturn: { value: saturn },
      uRings: { value: rings.tex },
      uRingRange: { value: new THREE.Vector2(rings.inner / radiusKm, rings.outer / radiusKm) },
    });
    this.placed = layoutAt(this.start, false);
  }

  /** The simulated date now. */
  private get date(): Date {
    return new Date(this.start.getTime() + this.days * DAY_MS);
  }

  /** Every body's place for the current date and scale (cached per frame). */
  private layout(trueScale: boolean): Record<SolarBodyId, PlacedBody> {
    const key = `${this.days}|${trueScale}`;
    if (key !== this.placedKey) {
      this.placed = layoutAt(this.date, trueScale);
      this.placedKey = key;
      this.trueScale = trueScale;
    }
    return this.placed;
  }

  focus(bodyId: string, params: SolarSystemParams): SceneFocus | null {
    const placed = this.layout(params.trueScale);
    const body = findSolarBody(bodyId);
    if (!body) {
      this.focusId = 'solar-system';
      return {
        target: new THREE.Vector3(),
        view: { elevation: 32, yaw: 25, distance: params.trueScale ? 80 : 9.5 },
        minDistance: 0.005,
      };
    }
    this.focusId = body.id;
    const p = placed[body.id];
    const target = new THREE.Vector3(...p.pos);
    // look from partly sunward, so the day side shows with a little terminator
    const toSun = target.lengthSq() > 0 ? target.clone().negate().normalize() : v3().set(0, 0, 1);
    const yaw = (Math.atan2(toSun.x, toSun.z) * 180) / Math.PI + 38;
    return {
      target,
      view: {
        elevation: body.id === 'saturn' ? 24 : 12,
        yaw,
        distance: p.radius * (VIEW_RADII[body.id] ?? 3.2),
      },
      minDistance: p.radius * 1.15,
    };
  }

  setLayout({ aspect, starRows }: SceneLayout): void {
    const u = this.pass.uniforms;
    u.uAspect.value = aspect;
    u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / starRows;
  }

  render(frame: SceneFrame<SolarSystemParams>): void {
    const { renderer, target, camera, settings, params: p, dt, frozenTime } = frame;
    const placed = this.layout(p.trueScale);
    const u = this.pass.uniforms;
    u.uCamBasis.value.setFromMatrix4(camera.matrixWorld);
    u.uTime.value = this.realTime;
    u.uRedshiftView.value = settings.debugView === 'redshift';
    u.uCorona.value = p.corona;
    u.uStarDensity.value = p.starDensity;

    // exposure: like a camera, set for the body you're looking at (its sunlight and albedo), so
    // its neighbours show their true brightness next to it; the overview just compresses
    const focus = this.focusId === 'solar-system' ? null : placed[this.focusId as SolarBodyId];
    const cam = camera.position;
    for (const b of SOLAR_BODIES) {
      const pb = placed[b.id];
      const i = b.index;
      u.uBody.value[i].set(pb.pos[0] - cam.x, pb.pos[1] - cam.y, pb.pos[2] - cam.z, pb.radius);
      u.uFlat.value[i] = pb.polar / pb.radius;
      u.uAxisX.value[i].set(...pb.axes[0]);
      u.uAxisY.value[i].set(...pb.axes[1]);
      u.uAxisZ.value[i].set(...pb.axes[2]);
      const a = ALBEDO[b.id];
      const sun = Math.max(pb.sunDistance, 1e-3);
      let gain: number;
      if (focus && focus.body.id !== 'sun') {
        const fa = ALBEDO[focus.body.id].real;
        gain = (a.real / fa) * (focus.sunDistance / sun) ** 2;
      } else {
        gain = (a.real / 0.45) * (1 / sun) ** 0.5;
      }
      u.uGain.value[i] = (p.daylight * 1.1 * gain) / a.map;
    }
    this.pass.render(renderer, target);

    // the clock runs after drawing, so focus() next frame sees the same date this frame drew
    if (frozenTime !== null) {
      this.days = frozenTime * SOLAR_SYSTEM_PARAMS.timeRate.default;
      this.realTime = frozenTime;
    } else if (!settings.paused) {
      this.days += dt * p.timeRate;
      this.realTime += dt;
    }
  }

  /** Orbits as dotted lines (overview only), and a clickable tag on every body. */
  labels(): SceneLabel[] {
    const out: SceneLabel[] = [];
    const placed = this.placed;
    if (this.focusId === 'solar-system' || this.focusId === 'sun') {
      for (const orbit of this.orbitPoints()) {
        for (const position of orbit.points) out.push({ position, text: '.', style: 'dim' });
      }
    }
    const near = this.focusId === 'earth' || this.focusId === 'moon';
    for (const b of SOLAR_BODIES) {
      if (b.id === 'moon' && !near) continue;
      if (b.id === this.focusId) continue;
      const pb = placed[b.id];
      const pos = this.labelPos[b.index].set(...pb.pos);
      out.push({ position: pos, text: b.name, radius: pb.radius, target: b.id });
    }
    return out;
  }

  /** Orbit dots in scene coordinates, recomputed when the scale changes or a month goes by. */
  private orbitPoints() {
    const key = `${this.trueScale}|${Math.floor(this.days / 30)}`;
    if (key !== this.orbitsKey) {
      const date = this.date;
      const place = (v: Vec3): THREE.Vector3 => {
        const r = Math.hypot(...v);
        const k = this.trueScale ? 1 : squeeze(r) / r;
        return new THREE.Vector3(v[0] * k, v[2] * k, -v[1] * k);
      };
      this.orbits = PLANET_IDS.map((id) => ({
        points: orbitPath(id, date, ORBIT_POINTS).map(place),
      }));
      this.orbitsKey = key;
    }
    return this.orbits;
  }

  hudRows(camera: THREE.PerspectiveCamera): Array<[string, string]> {
    const iso = this.date.toISOString();
    const rows: Array<[string, string]> = [
      ['DATE', `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`],
      ['SCALE', this.trueScale ? 'TRUE' : 'LOG DIST'],
    ];
    if (this.focusId !== 'solar-system') {
      const pb = this.placed[this.focusId as SolarBodyId];
      const d = camera.position.distanceTo(new THREE.Vector3(...pb.pos));
      const km = Math.max(0, d - pb.radius) * AU_KM;
      rows.push([
        'ALT',
        km < 1e7 ? `${Math.round(km).toLocaleString('en-US')} KM` : `${(km / AU_KM).toFixed(2)} AU`,
      ]);
    }
    return rows;
  }

  dispose(): void {
    this.pass.dispose();
    for (const t of this.textures) t.dispose();
  }
}
