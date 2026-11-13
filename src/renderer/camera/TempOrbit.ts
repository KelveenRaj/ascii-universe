import type * as THREE from 'three';

const DEG = Math.PI / 180;

/** Camera presets as [elevation above the disk plane, yaw] in degrees. Inclination = 90 - elevation. */
export const VIEW_PRESETS = {
  interstellar: { elevation: 10, yaw: 0 }, // ~80° inclination, disk nearly edge-on
  eht: { elevation: 73, yaw: 0 }, // ~17° inclination, M87*'s viewing angle
  topDown: { elevation: 89, yaw: 0 },
} as const;

/**
 * TEMPORARY (Milestone 1): drag to orbit, wheel to zoom, 1/2/3 for presets. Replaced in M3 by the
 * full CameraController + InputManager (pan, roll, keyboard, touch, damping).
 */
export class TempOrbit {
  yaw = VIEW_PRESETS.interstellar.yaw * DEG;
  elevation = VIEW_PRESETS.interstellar.elevation * DEG;
  distance = 26;

  private readonly el: HTMLElement;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
  }

  setPreset(name: keyof typeof VIEW_PRESETS): void {
    this.elevation = VIEW_PRESETS[name].elevation * DEG;
    this.yaw = VIEW_PRESETS[name].yaw * DEG;
  }

  /** Writes position + orientation into `camera` (used purely as a math container). */
  apply(camera: THREE.PerspectiveCamera): void {
    const ce = Math.cos(this.elevation);
    camera.position.set(
      this.distance * ce * Math.sin(this.yaw),
      this.distance * Math.sin(this.elevation),
      this.distance * ce * Math.cos(this.yaw),
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.el.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.yaw -= dx * 0.005;
    this.elevation = Math.min(89 * DEG, Math.max(-89 * DEG, this.elevation + dy * 0.005));
  };

  private onUp = (e: PointerEvent) => {
    this.dragging = false;
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.distance = Math.min(120, Math.max(3, this.distance * Math.exp(e.deltaY * 0.001)));
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === '1') this.setPreset('interstellar');
    else if (e.key === '2') this.setPreset('eht');
    else if (e.key === '3') this.setPreset('topDown');
  };

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
  }
}
