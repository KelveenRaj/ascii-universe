/**
 * The on-screen flight controls (for touch), as virtual keys: the UI holds and releases the same
 * key codes the keyboard uses, and FlightInput reads them alongside the real keys. Steering on touch
 * is dragging on the screen, which FlightInput already handles.
 */
const held = new Set<string>();
let presses: string[] = [];

export const flightPad = {
  /** Holds a key (KeyW throttle up, KeyS down, ShiftLeft boost, KeyX stop) until released. */
  hold(code: string, on: boolean): void {
    if (on) held.add(code);
    else held.delete(code);
  },
  /** A one-shot press (KeyT target, KeyJ jump). */
  press(code: string): void {
    presses.push(code);
  },
  isHeld(code: string): boolean {
    return held.has(code);
  },
  takePresses(): string[] {
    const out = presses;
    presses = [];
    return out;
  },
  clear(): void {
    held.clear();
    presses = [];
  },
};
