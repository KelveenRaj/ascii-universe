/**
 * One-shot commands from the UI to the engine (things that aren't settings, like "jump to this
 * view"). The engine subscribes; React just calls `sendCommand`.
 */
export type Command =
  /** Jump to one of the active scene's camera presets, by id. */
  | { type: 'preset'; preset: string }
  | { type: 'resetView' }
  /** Snapshot the current frame as text and open the copy-as-text dialog. */
  | { type: 'captureText' }
  /** Save the current frame as a PNG (the share image). */
  | { type: 'captureImage' }
  /** Copy a link to this view (body and camera angle) to the clipboard. */
  | { type: 'copyLink' };

type Listener = (command: Command) => void;
const listeners = new Set<Listener>();

export function sendCommand(command: Command): void {
  listeners.forEach((listener) => listener(command));
}

export function onCommand(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
