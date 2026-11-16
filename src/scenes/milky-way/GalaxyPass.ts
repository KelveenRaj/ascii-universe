import * as THREE from 'three';
import type { SceneLayout } from '@/engine/display/DisplayPipeline';
import type { SceneLabel } from '@/engine/display/labels';
import { FullscreenPass } from '@/engine/FullscreenPass';
import type { SceneFrame, SceneInstance } from '@/engine/scene/SceneModule';
import { armLabelPoints, GALAXY, galaxyToWorld, withGalaxyLayout } from '@/scenes/milky-way/layout';
import { MILKY_WAY_PARAMS, type MilkyWayParams } from '@/scenes/milky-way/params';
import galaxyFrag from '@/scenes/milky-way/shaders/galaxy.frag';

type U<T> = THREE.IUniform<T>;

const DEG = Math.PI / 180;

/** Ray-marches the galaxy (see shaders/galaxy.frag) and keeps track of how far it has turned. */
export class GalaxyPass implements SceneInstance<MilkyWayParams> {
  private readonly pass: FullscreenPass<{
    uCamPos: U<THREE.Vector3>;
    uCamBasis: U<THREE.Matrix3>;
    uTanHalfFov: U<number>;
    uAspect: U<number>;
    uPixelAngle: U<number>;
    uMaxSteps: U<number>;
    uAngle: U<number>;
    uStarDensity: U<number>;
    uArmContrast: U<number>;
    uDust: U<number>;
    uRedshiftView: U<boolean>;
  }>;
  /** Radians the galaxy has turned. */
  private turned = 0;
  private readonly sun = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly armLabels = armLabelPoints().map((a) => ({
    ...a,
    position: new THREE.Vector3(),
  }));
  /** sin of the camera's elevation above the disk, from the last frame (arm labels hide edge-on). */
  private elevation = 1;

  constructor(tanHalfFov: number) {
    this.pass = new FullscreenPass(withGalaxyLayout(galaxyFrag), {
      uCamPos: { value: new THREE.Vector3() },
      uCamBasis: { value: new THREE.Matrix3() },
      uTanHalfFov: { value: tanHalfFov },
      uAspect: { value: 1 },
      uPixelAngle: { value: 0.002 },
      uMaxSteps: { value: 300 },
      uAngle: { value: 0 },
      uStarDensity: { value: 0.3 },
      uArmContrast: { value: 1 },
      uDust: { value: 1 },
      uRedshiftView: { value: false },
    });
  }

  setLayout({ aspect, starRows }: SceneLayout): void {
    const u = this.pass.uniforms;
    u.uAspect.value = aspect;
    u.uPixelAngle.value = (2 * u.uTanHalfFov.value) / starRows;
  }

  render(frame: SceneFrame<MilkyWayParams>): void {
    const { renderer, target, camera, settings, params: p, dt, steps, frozenTime } = frame;
    if (frozenTime !== null) this.turned = frozenTime * MILKY_WAY_PARAMS.spin.default * DEG;
    else if (!settings.paused) this.turned += dt * p.spin * DEG;
    const u = this.pass.uniforms;
    u.uCamPos.value.copy(camera.position);
    this.elevation = Math.abs(camera.position.y) / Math.max(camera.position.length(), 1e-6);
    u.uCamBasis.value.setFromMatrix4(camera.matrixWorld);
    u.uMaxSteps.value = steps;
    u.uAngle.value = this.turned;
    u.uStarDensity.value = p.starDensity;
    u.uArmContrast.value = p.armContrast;
    u.uDust.value = p.dust;
    u.uRedshiftView.value = settings.debugView === 'redshift';
    this.pass.render(renderer, target);
  }

  /**
   * Sgr A* at the centre (click it to warp there), the Sun, and the spiral arms by name (from the
   * same arm model the shader draws), all turning with the galaxy. Arm names would pile up on one
   * line seen edge-on, so they only show from 25° above the disk.
   */
  labels(): SceneLabel[] {
    galaxyToWorld(GALAXY.sunRadius, GALAXY.sunAngle, this.turned, this.sun);
    const labels: SceneLabel[] = [
      { position: this.centre, text: 'SGR A*', radius: 2.5, target: 'sgr-a-star' },
      { position: this.sun, text: 'SUN', radius: 1, style: 'normal' },
    ];
    if (this.elevation > Math.sin((25 * Math.PI) / 180)) {
      for (const a of this.armLabels) {
        galaxyToWorld(a.radius, a.angle, this.turned, a.position);
        labels.push({ position: a.position, text: a.text, style: 'dim' });
      }
    }
    return labels;
  }

  hudRows(camera: THREE.PerspectiveCamera): Array<[string, string]> {
    const pos = camera.position;
    const distance = pos.length();
    const inclination = (Math.acos(Math.abs(pos.y) / Math.max(distance, 1e-6)) * 180) / Math.PI;
    return [
      ['DIST', `${distance.toFixed(0)} KLY`],
      ['INCL', `${inclination.toFixed(0)}°`],
    ];
  }

  dispose(): void {
    this.pass.dispose();
  }
}
