export const DAY_MS = 86400000;

/**
 * The date the Solar System starts on: `?date=YYYY-MM-DD[THH:MM]` (UTC) if it's there, else now.
 * Shared by the explore scene and the open world's Sol layer, so both show the same sky.
 */
export function startDate(
  search = typeof window === 'undefined' ? '' : window.location.search,
): Date {
  const raw = new URLSearchParams(search).get('date');
  if (raw && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(raw)) {
    const d = new Date(raw.length === 10 ? `${raw}T00:00:00Z` : `${raw}:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
