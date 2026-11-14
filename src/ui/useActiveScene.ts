import { useStore } from 'zustand';
import { getBody } from '@/content/catalog';
import type { SceneModule } from '@/engine/scene/SceneModule';
import { getScene } from '@/scenes/registry';
import { navigationStore } from '@/state/navigation';

/** The scene on screen (its title, camera presets…), re-rendering when it changes. */
export function useActiveScene(): SceneModule {
  return getScene(getBody(useStore(navigationStore, (s) => s.bodyId)).sceneId);
}
