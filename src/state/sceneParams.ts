import { createJSONStorage, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import {
  defaultParams,
  sanitizeParam,
  sanitizeParams,
  type ParamValue,
} from '@/engine/scene/params';
import { findScene, SCENES } from '@/scenes/registry';
import { migrateLegacySceneParams, SCENE_PARAMS_KEY } from '@/state/legacySettings';

/**
 * Every scene's params, keyed by scene id, saved to localStorage. Always holds a full, valid value
 * object for every registered scene, so the render loop can read `values[sceneId]` directly.
 */
export type AllSceneParams = Record<string, Record<string, ParamValue>>;

export interface SceneParamsState {
  values: AllSceneParams;
  /** Sets one param; numbers are clamped to range, invalid values ignored. */
  set: (sceneId: string, key: string, value: ParamValue) => void;
  resetScene: (sceneId: string) => void;
  resetAll: () => void;
}

const schemaFor = (sceneId: string) => findScene(sceneId)?.params;

export function defaultSceneParams(): AllSceneParams {
  const out: AllSceneParams = {};
  for (const scene of Object.values(SCENES)) out[scene.id] = defaultParams(scene.params);
  return out;
}

/** Validates saved params against every registered scene's schema (unknown scenes dropped). */
export function sanitizeSceneParams(raw: unknown): AllSceneParams {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: AllSceneParams = {};
  for (const scene of Object.values(SCENES)) {
    out[scene.id] = sanitizeParams(scene.params, input[scene.id]);
  }
  return out;
}

migrateLegacySceneParams();

export const sceneParamsStore = createStore<SceneParamsState>()(
  persist(
    (set, get) => ({
      values: defaultSceneParams(),
      set: (sceneId, key, value) => {
        const param = schemaFor(sceneId)?.[key];
        const clean = param && sanitizeParam(param, value);
        if (clean === undefined) return;
        const values = get().values;
        set({ values: { ...values, [sceneId]: { ...values[sceneId], [key]: clean } } });
      },
      resetScene: (sceneId) => {
        const schema = schemaFor(sceneId);
        if (schema) set({ values: { ...get().values, [sceneId]: defaultParams(schema) } });
      },
      resetAll: () => set({ values: defaultSceneParams() }),
    }),
    {
      name: SCENE_PARAMS_KEY,
      version: 1,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (s) => ({ values: s.values }),
      merge: (persisted, current) => ({
        ...current,
        values: sanitizeSceneParams((persisted as { values?: unknown } | undefined)?.values),
      }),
    },
  ),
);
