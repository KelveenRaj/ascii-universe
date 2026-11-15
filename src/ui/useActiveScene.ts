import { useStore } from 'zustand';
import { getBody } from '@/content/catalog';
import type { SceneModule } from '@/engine/scene/SceneModule';
import { getScene } from '@/scenes/registry';
import { navigationStore } from '@/state/navigation';
import { worldStore } from '@/state/world';

/** The scene on screen (its title, camera presets…), re-rendering when it changes. */
export function useActiveScene(): SceneModule {
  const bodyId = useStore(navigationStore, (s) => s.bodyId);
  const world = useStore(navigationStore, (s) => s.world);
  const worldScene = useStore(worldStore, (s) => s.sceneId);
  return getScene(world ? worldScene : getBody(bodyId).sceneId);
}
