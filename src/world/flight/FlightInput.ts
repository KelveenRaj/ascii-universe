import { isTypingTarget } from '@/engine/camera/InputManager';
import type { FlightControls } from '@/world/flight/FlightModel';

/** Drag this far (CSS px) from where you pressed for a full-rate turn. */
const DRAG_FULL_PX = 90;

const KEYS = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyX',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);

/** One-shot keys: each press is reported once by takePresses(). */
const PRESS_KEYS = new Set(['KeyT', 'KeyJ']);

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Keyboard and mouse → flight controls. Keys: W / S throttle, arrows pitch and turn, A / D turn,
 * Q / E roll, Shift boost, X stop, T target, J jump. Dragging on the screen steers like a stick: the further from
 * where you pressed, the harder the turn. Touch controls come later (on-screen stick).
 * Only listens while enabled.
 */
export class FlightInput {
  private readonly held = new Set<string>();
  private presses: string[] = [];
  private readonly canvas: HTMLElement;
  private enabled = false;
  private drag: { id: number; x: number; y: number; dx: number; dy: number } | null = null;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.held.clear();
    this.presses = [];
    this.drag = null;
  }

  /** One-shot keys pressed since the last call ('KeyT' target, 'KeyJ' jump), oldest first. */
  takePresses(): string[] {
    const out = this.presses;
    this.presses = [];
    return out;
  }

  controls(): FlightControls {
    const k = (code: string) => (this.held.has(code) ? 1 : 0);
    const stickX = this.drag ? clamp(this.drag.dx / DRAG_FULL_PX) : 0;
    const stickY = this.drag ? clamp(this.drag.dy / DRAG_FULL_PX) : 0;
    return {
      pitch: clamp(k('ArrowUp') - k('ArrowDown') - stickY),
      yaw: clamp(k('ArrowLeft') + k('KeyA') - k('ArrowRight') - k('KeyD') - stickX),
      roll: clamp(k('KeyE') - k('KeyQ')),
      throttle: k('KeyW') - k('KeyS'),
      stop: this.held.has('KeyX'),
      boost: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
    };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
    if (PRESS_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.presses.push(e.code);
      return;
    }
    if (!KEYS.has(e.code)) return;
    e.preventDefault();
    this.held.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
    this.drag = null;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled || e.button !== 0 || this.drag) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag.dx = e.clientX - this.drag.x;
    this.drag.dy = e.clientY - this.drag.y;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.drag && e.pointerId === this.drag.id) this.drag = null;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }
}
