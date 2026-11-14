import type { CameraController } from '@/engine/camera/CameraController';

/** Radians of orbit per viewport-height of drag. */
const ORBIT_PER_HEIGHT = Math.PI;
/** Keyboard rates, per second. */
const KEY_ORBIT_RATE = 1.4; // rad/s
const KEY_ROLL_RATE = 1.4; // rad/s
const KEY_PAN_RATE = 0.6; // viewport heights/s
const KEY_ZOOM_RATE = 1.2; // e-folds/s
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;

/** Digit1–9 / Numpad1–9 → preset index 0–8 (the active scene's presets, in order). */
const presetIndexForKey = (code: string): number => {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) - 1 : -1;
};
const RESET_KEYS = new Set(['Digit0', 'Numpad0', 'Home']);
/** Held-key camera controls, by KeyboardEvent.code (layout-independent). */
const HELD_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyZ',
  'KeyX',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Equal',
  'Minus',
  'NumpadAdd',
  'NumpadSubtract',
  'PageUp',
  'PageDown',
  'ShiftLeft',
  'ShiftRight',
]);
const PREVENT_DEFAULT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
]);

interface PointerInfo {
  x: number;
  y: number;
  type: string;
}

type DragMode = 'none' | 'orbit' | 'pan' | 'gesture';

/**
 * True when the event comes from a form field or from inside a UI panel (anything marked
 * `data-ui`), where camera and render shortcuts must not fire.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    (target instanceof Element && target.closest('[data-ui]') !== null) ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Turns pointer, wheel, touch and keyboard input into CameraController calls.
 *
 * Mouse: left-drag orbit · right/middle/shift-drag pan · wheel zoom · double-click reset.
 * Touch: one finger orbit · two fingers pan + pinch zoom + twist roll · double-tap reset.
 * Keys: WASD/arrows orbit (Shift = pan) · Q/E roll · Z/X, +/−, PgUp/PgDn zoom · 1–9 scene presets · 0 reset.
 */
export class InputManager {
  private readonly el: HTMLElement;
  private readonly camera: CameraController;
  private readonly pointers = new Map<number, PointerInfo>();
  private readonly held = new Set<string>();
  private mode: DragMode = 'none';
  private gesture = { cx: 0, cy: 0, dist: 1, angle: 0 };
  private lastTap = { time: 0, x: 0, y: 0 };
  private enabled = true;

  constructor(el: HTMLElement, camera: CameraController) {
    this.el = el;
    this.camera = camera;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
    el.addEventListener('dblclick', this.onDoubleClick);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Off while a game runs: the game gets the input instead, and the camera stays put. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.held.clear();
    this.pointers.clear();
    this.mode = 'none';
  }

  /** Applies held keys. Call once per frame before CameraController.update(). */
  update(dt: number): void {
    if (!this.enabled || this.held.size === 0 || dt <= 0) return;
    const has = (...codes: string[]) => codes.some((c) => this.held.has(c));
    const shift = has('ShiftLeft', 'ShiftRight');
    const ax = Number(has('KeyD', 'ArrowRight')) - Number(has('KeyA', 'ArrowLeft'));
    const ay = Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown'));
    const roll = Number(has('KeyQ')) - Number(has('KeyE'));
    const zoom =
      Number(has('KeyX', 'Minus', 'NumpadSubtract', 'PageDown')) -
      Number(has('KeyZ', 'Equal', 'NumpadAdd', 'PageUp'));

    if (ax || ay) {
      // the camera moves in the pressed direction (so the scene moves the other way)
      if (shift) this.camera.pan(-ax * KEY_PAN_RATE * dt, ay * KEY_PAN_RATE * dt);
      else this.camera.orbit(ax * KEY_ORBIT_RATE * dt, ay * KEY_ORBIT_RATE * dt);
    }
    if (roll) this.camera.rollBy(roll * KEY_ROLL_RATE * dt);
    if (zoom) this.camera.zoom(Math.exp(zoom * KEY_ZOOM_RATE * dt));
  }

  // ---- pointers -------------------------------------------------------------------------------

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled || this.pointers.size >= 2) return; // ignore third+ fingers
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    this.camera.notifyInput();

    if (e.pointerType === 'mouse') {
      this.mode = e.button === 0 && !e.shiftKey ? 'orbit' : 'pan';
    } else {
      this.mode = this.pointers.size === 2 ? 'gesture' : 'orbit';
      if (this.mode === 'gesture') this.gesture = this.measureGesture();
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const h = Math.max(1, this.el.clientHeight);
    const dx = (e.clientX - p.x) / h;
    const dy = (e.clientY - p.y) / h;
    p.x = e.clientX;
    p.y = e.clientY;

    if (this.mode === 'orbit') {
      this.camera.orbitScreen(dx * ORBIT_PER_HEIGHT, dy * ORBIT_PER_HEIGHT);
    } else if (this.mode === 'pan') {
      this.camera.pan(dx, dy);
    } else if (this.mode === 'gesture' && this.pointers.size === 2) {
      const g = this.measureGesture();
      this.camera.pan((g.cx - this.gesture.cx) / h, (g.cy - this.gesture.cy) / h);
      this.camera.zoom(this.gesture.dist / g.dist);
      // DOM angles grow clockwise, and positive roll turns the image clockwise
      this.camera.rollBy(angleDelta(this.gesture.angle, g.angle));
      this.gesture = g;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);

    if (p.type !== 'mouse' && e.type === 'pointerup' && this.pointers.size === 0) {
      this.detectDoubleTap(e);
    }
    // two fingers → one: carry on orbiting with the remaining finger
    this.mode = this.pointers.size === 1 && p.type !== 'mouse' ? 'orbit' : 'none';
  };

  private detectDoubleTap(e: PointerEvent): void {
    const now = performance.now();
    const near =
      Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < DOUBLE_TAP_SLOP_PX;
    if (now - this.lastTap.time < DOUBLE_TAP_MS && near) {
      this.camera.reset();
      this.lastTap.time = 0;
    } else {
      this.lastTap = { time: now, x: e.clientX, y: e.clientY };
    }
  }

  private measureGesture() {
    const [a, b] = [...this.pointers.values()];
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.enabled) return;
    // normalise line/page deltas to pixels
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.el.clientHeight : 1;
    // trackpad pinch arrives as ctrl+wheel with small deltas: give it more punch
    const k = e.ctrlKey ? 0.01 : 0.0015;
    this.camera.zoom(Math.exp(e.deltaY * scale * k));
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  private onDoubleClick = () => {
    if (this.enabled) this.camera.reset();
  };

  // ---- keyboard -------------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    if (HELD_KEYS.has(e.code)) {
      this.held.add(e.code);
      this.camera.notifyInput();
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    }
    if (e.repeat) return;
    const preset = this.camera.presets[presetIndexForKey(e.code)];
    if (preset) this.camera.setPreset(preset.id);
    else if (RESET_KEYS.has(e.code)) this.camera.reset();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  /** Keys released while the window is unfocused never send keyup; drop them all. */
  private onBlur = () => {
    this.held.clear();
  };

  dispose(): void {
    const el = this.el;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    el.removeEventListener('dblclick', this.onDoubleClick);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

/** Smallest signed difference between two angles. */
function angleDelta(from: number, to: number): number {
  const d = to - from;
  return d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
}
