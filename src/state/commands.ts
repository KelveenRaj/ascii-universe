import type { ViewPreset } from '../renderer/camera/CameraController';

/**
 * One-shot commands from the UI to the engine (things that aren't settings, like "jump to this
 * view"). The engine subscribes; React just calls `sendCommand`.
 */
export type Command = { type: 'preset'; preset: ViewPreset } | { type: 'resetView' };

type Listener = (command: Command) => void;
const listeners = new Set<Listener>();

export function sendCommand(command: Command): void {
  listeners.forEach((listener) => listener(command));
}

export function onCommand(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
