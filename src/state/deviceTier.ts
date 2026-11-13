import type { Settings } from '@/state/settings';

/**
 * Coarse device detection for starting defaults. A touch-first device (phone, tablet) gets lighter
 * defaults; everything is still adjustable, and auto quality takes it from there.
 */
export const IS_TOUCH_DEVICE =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

/** Highest device-pixel ratio we render at. */
export const MAX_PIXEL_RATIO = IS_TOUCH_DEVICE ? 1.5 : 2;

/** Auto quality starts here (index into AUTO_TIERS). */
export const AUTO_START_TIER = IS_TOUCH_DEVICE ? 2 : 0;

export function deviceDefaults(): Partial<Settings> {
  if (!IS_TOUCH_DEVICE) return {};
  return {
    supersample: 1,
    // keep scanlines and vignette (nearly free, and they carry the look); drop the rest
    curvature: false,
    chromatic: false,
    flicker: false,
  };
}
