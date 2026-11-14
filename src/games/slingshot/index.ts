import type { GameModule } from '@/engine/game/Game';
import { Slingshot } from '@/games/slingshot/Slingshot';

/** Fling a probe past Sgr A* on the edge-on view. */
export const slingshotGame: GameModule = {
  id: 'slingshot',
  title: 'Slingshot',
  blurb: 'Fling a probe past the black hole and bend its path.',
  bodyId: 'sgr-a-star',
  cameraPreset: 'interstellar',
  create: (ctx) => new Slingshot(ctx),
};
