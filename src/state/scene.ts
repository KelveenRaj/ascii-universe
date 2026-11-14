import { createStore } from 'zustand/vanilla';
import { DEFAULT_SCENE_ID, getScene, type SceneId } from '@/scenes/registry';

/**
 * Which place is on screen. The engine builds that scene; the UI reads it for presets and labels.
 * Becomes part of the navigation store (with URL sync) in M6.
 */
export interface SceneState {
  sceneId: SceneId;
}

export const sceneStore = createStore<SceneState>()(() => ({ sceneId: DEFAULT_SCENE_ID }));

export const activeScene = () => getScene(sceneStore.getState().sceneId);
