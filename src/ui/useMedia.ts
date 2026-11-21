import { useSyncExternalStore } from 'react';

/** Tracks a CSS media query. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** A phone, in either orientation: narrow, or short (landscape). */
export const COMPACT_QUERY = '(max-width: 640px), (max-height: 500px)';
