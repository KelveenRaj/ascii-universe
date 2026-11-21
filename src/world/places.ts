import { SOLAR_BODIES } from '@/scenes/solar-system/bodies';

/** Is this catalog body part of the Solar System (the system itself, the Sun, a planet, the Moon)? */
export const inSolarSystem = (id: string): boolean =>
  id === 'solar-system' || SOLAR_BODIES.some((b) => b.id === id);

/** Bodies you can fly up to in exploration mode: everything except the galaxy as a whole. */
export const canFlyTo = (id: string): boolean => id === 'sgr-a-star' || inSolarSystem(id);
