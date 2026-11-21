import { navigationStore } from '@/state/navigation';
import { worldStore } from '@/state/world';
import { canFlyTo } from '@/world/places';

/**
 * Switches to exploration mode with the ship already at `bodyId` (a planet, the Sun, Sgr A*…),
 * instead of wherever it was last. Bodies you can't fly to just launch normally.
 */
export function flyTo(bodyId: string): void {
  worldStore.setState({ startAt: canFlyTo(bodyId) ? bodyId : null });
  navigationStore.getState().setWorld(true);
}
