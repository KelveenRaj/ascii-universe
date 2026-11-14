import type { SceneModule } from '@/engine/scene/SceneModule';
import { blackHoleScene } from '@/scenes/black-hole';

/**
 * Every place you can visit. Static imports for now; once there are several scenes these become
 * lazy `import()`s so each scene ships as its own chunk.
 */
export const SCENES = {
  [blackHoleScene.id]: blackHoleScene,
} as const satisfies Record<string, SceneModule>;

export type SceneId = keyof typeof SCENES;

export const DEFAULT_SCENE_ID: SceneId = blackHoleScene.id;

export function getScene(id: SceneId): SceneModule {
  return SCENES[id];
}

/** Lookup by an untrusted string (saved data, URLs). */
export function findScene(id: string): SceneModule | undefined {
  return Object.hasOwn(SCENES, id) ? SCENES[id as SceneId] : undefined;
}
