/** localStorage keys. */
export const SETTINGS_KEY = 'ascii-universe:settings';
export const SCENE_PARAMS_KEY = 'ascii-universe:scene-params';

/** Settings v1 kept the black hole's knobs in the global settings. They now live in scene params. */
const V1_BLACK_HOLE_KEYS = ['diskSpeed', 'beaming', 'diskInner', 'diskOuter', 'starDensity'];

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // e.g. storage blocked
  }
}

/**
 * One-off move of v1 black-hole values from the saved settings into the saved scene params, so
 * nobody loses them. Runs before either store loads (both call it; it's idempotent): it does
 * nothing once scene params exist. Values are copied as-is and validated by the scene-params store.
 */
export function migrateLegacySceneParams(store: Storage | null = storage()): void {
  if (!store) return;
  try {
    if (store.getItem(SCENE_PARAMS_KEY) !== null) return;
    const raw = store.getItem(SETTINGS_KEY);
    if (raw === null) return;
    const state = (JSON.parse(raw) as { state?: Record<string, unknown> } | null)?.state;
    if (!state || typeof state !== 'object') return;
    const picked: Record<string, unknown> = {};
    for (const key of V1_BLACK_HOLE_KEYS) if (key in state) picked[key] = state[key];
    if (Object.keys(picked).length === 0) return;
    store.setItem(
      SCENE_PARAMS_KEY,
      JSON.stringify({ state: { values: { 'black-hole': picked } }, version: 1 }),
    );
  } catch {
    // unreadable old data: start from defaults
  }
}
