import { useStore } from 'zustand';
import type { SceneModule } from '@/engine/scene/SceneModule';
import { getScene } from '@/scenes/registry';
import { sceneStore } from '@/state/scene';

/** The scene on screen (its title, camera presets…), re-rendering when it changes. */
export function useActiveScene(): SceneModule {
  return getScene(useStore(sceneStore, (s) => s.sceneId));
}
