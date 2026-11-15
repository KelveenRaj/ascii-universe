/**
 * Product events (first flight, first jump, ship saved, …) for learning what players actually do.
 * Nothing is sent anywhere yet: the default sink drops everything. A sink that POSTs to a
 * same-origin `/api/event` can replace it once the game is hosted, without touching callers.
 */
export interface EventSink {
  track(name: string, props?: Record<string, string | number>): void;
}

export const noopSink: EventSink = { track: () => {} };

let sink: EventSink = noopSink;

export const setEventSink = (next: EventSink): void => {
  sink = next;
};

export const track = (name: string, props?: Record<string, string | number>): void => {
  try {
    sink.track(name, props);
  } catch {
    // analytics must never break the game
  }
};
