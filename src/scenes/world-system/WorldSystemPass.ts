import * as THREE from 'three';
import type { SceneLayout } from '@/engine/display/DisplayPipeline';
import { FullscreenPass } from '@/engine/FullscreenPass';
import type { SceneFrame, SceneInstance } from '@/engine/scene/SceneModule';
import type { WorldSystemParams } from '@/scenes/world-system/params';
import worldSystemFrag from '@/scenes/world-system/shaders/world-system.frag';

type U<T> = THREE.IUniform<T>;

/** Must match PLANET_MAX in world-system.frag. */
export const PLANET_MAX = 8;

/**
 * Ray-traces a star system around the ship (see shaders/world-system.frag). The open world's
 * flight hands over the star and planets each frame, already relative to the camera.
 */
export class WorldSystemPass implements SceneInstance<WorldSystemParams> {
  private readonly pass: FullscreenPass<{
    uCamBasis: U<THREE.Matrix3>;
    uTanHalfFov: U<number>;
    uAspect: U<number>;
    uPixelAngle: U<number>;
    uTime: U<number>;
    uRedshiftView: U<boolean>;
    uStar: U<THREE.Vector4>;
    uStarMaterial: U<number>;
    uStarGlow: U<number>;
    uCorona: U<number>;
    uDaylight: U<number>;
    uNightside: U<number>;
    uStarDensity: U<number>;
    uPlanet: U<THREE.Vector4[]>;
    uPlanetInfo: U<THREE.Vector2[]>;
    uRing: U<THREE.Vector4[]>;
    uPlanetCount: U<number>;
  }>;
  private time = 0;

  constructor(tanHalfFov: number) {
    const vec4s = () => Array.from({ length: PLANET_MAX }, () => new THREE.Vector4());
    this.pass = new FullscreenPass(worldSystemFrag, {
      uCamBasis: { value: new THREE.Matrix3() },
      uTanHalfFov: { value: tanHalfFov },
      uAspect: { value: 1 },
      uPixelAngle: { value: 0.002 },
      uTime: { value: 0 },
      uRedshiftView: { value: false },
      // until the flight says otherwise: a star far away, so nothing covers the screen
      uStar: { value: new THREE.Vector4(0, 0, -1e4, 1) },
      uStarMaterial: { value: 1 },
      uStarGlow: { value: 2 },
      uCorona: { value: 1 },
      uDaylight: { value: 1 },
      uNightside: { value: 0.04 },
      uStarDensity: { value: 0.4 },
      uPlanet: { value: vec4s() },
      uPlanetInfo: { value: Array.from({ length: PLANET_MAX }, () => new THREE.Vector2()) },
      uRing: { value: vec4s() },
      uPlanetCount: { value: 0 },
    });
  }

  setLayout({ aspect, starRows }: SceneLayout): void {
    const u = this.pass.uniforms;
    u.uAspect.value = aspect;
    u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / starRows;
  }

  render(frame: SceneFrame<WorldSystemParams>): void {
    const { renderer, target, camera, settings, params: p, dt, frozenTime, world } = frame;
    if (!settings.paused) this.time += dt;
    const u = this.pass.uniforms;
    u.uCamBasis.value.setFromMatrix4(camera.matrixWorld);
    u.uTime.value = frozenTime ?? this.time;
    u.uRedshiftView.value = settings.debugView === 'redshift';
    u.uStarGlow.value = p.starGlow;
    u.uCorona.value = p.corona;
    u.uDaylight.value = p.daylight;
    u.uNightside.value = p.nightside;
    u.uStarDensity.value = p.starDensity;

    const system = world?.system;
    if (system) {
      const s = system.star;
      u.uStar.value.set(s.rel[0], s.rel[1], s.rel[2], s.radius);
      u.uStarMaterial.value = s.material;
      const n = Math.min(PLANET_MAX, system.planets.length);
      for (let i = 0; i < n; i++) {
        const b = system.planets[i];
        u.uPlanet.value[i].set(b.rel[0], b.rel[1], b.rel[2], b.radius);
        u.uPlanetInfo.value[i].set(b.material, b.seed);
        if (b.ring)
          u.uRing.value[i].set(b.ring.normal[0], b.ring.normal[1], b.ring.normal[2], b.ring.outer);
        else u.uRing.value[i].set(0, 1, 0, 0);
      }
      u.uPlanetCount.value = n;
    }
    this.pass.render(renderer, target);
  }

  /** The open world shows its own readout (WorldHost), so nothing here. */
  hudRows(): Array<[string, string]> {
    return [];
  }

  dispose(): void {
    this.pass.dispose();
  }
}
