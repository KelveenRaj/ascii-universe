import type { SceneModule } from '@/engine/scene/SceneModule';
import { blackHoleScene } from '@/scenes/black-hole';
import { milkyWayScene } from '@/scenes/milky-way';
import { worldGalaxyScene } from '@/scenes/world-galaxy';
import { worldSystemScene } from '@/scenes/world-system';

/**
 * Every place you can visit, keyed by scene id (written out so SceneId is a union the content
 * files are checked against; tests/scenes.test.ts checks each key matches its scene's id).
 * Static imports for now; with more scenes these become lazy `import()`s, one chunk per scene.
 */
export const SCENES = {
  'milky-way': milkyWayScene,
  'black-hole': blackHoleScene,
  'world-galaxy': worldGalaxyScene,
  'world-system': worldSystemScene,
} as const satisfies Record<string, SceneModule>;

export type SceneId = keyof typeof SCENES;

export const DEFAULT_SCENE_ID: SceneId = 'milky-way';

export function getScene(id: SceneId): SceneModule {
  return SCENES[id];
}

/** Lookup by an untrusted string (saved data, URLs). */
export function findScene(id: string): SceneModule | undefined {
  return Object.hasOwn(SCENES, id) ? SCENES[id as SceneId] : undefined;
}
