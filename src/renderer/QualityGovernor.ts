/**
 * Auto quality: watches frame times and steps the render cost down when the frame rate drops,
 * and back up when there is headroom. Only frame times are known (no GPU timers), so "headroom"
 * means "keeping up with the display refresh"; an upgrade that immediately causes a drop makes
 * the next upgrade attempt wait twice as long.
 */

export interface QualityTier {
  name: string;
  /** Ray-march step budget. */
  steps: number;
  /** Supersampling is limited to this (the user's setting can still be lower). */
  maxSupersample: 1 | 2;
  /** Added to the automatic glyph scale (bigger cells → fewer of them). Ignored for fixed sizes. */
  scaleBoost: number;
}

/** Cheapest last. Order of sacrifice: ray steps, then supersampling, then grid resolution. */
export const AUTO_TIERS: readonly QualityTier[] = [
  { name: 'HIGH', steps: 300, maxSupersample: 2, scaleBoost: 0 },
  { name: 'MED', steps: 200, maxSupersample: 2, scaleBoost: 0 },
  { name: 'LOW', steps: 128, maxSupersample: 2, scaleBoost: 0 },
  { name: 'LOWER', steps: 96, maxSupersample: 1, scaleBoost: 0 },
  { name: 'MIN', steps: 80, maxSupersample: 1, scaleBoost: 1 },
];

const WINDOW_MS = 1000;
/** Average frame time above this (≈52 fps) counts as a slow window. */
const SLOW_FRAME_MS = 19;
/** Average frame time at or below this (keeping up with a 60 Hz display) counts as good. */
const GOOD_FRAME_MS = 17.5;
/** Consecutive slow windows before stepping down (so one hitch doesn't cost quality). */
const SLOW_WINDOWS = 2;
const UPGRADE_AFTER_MS = 8000;
const MAX_UPGRADE_AFTER_MS = 120000;
/** A step down this soon after a step up means the upgrade didn't fit: back off. */
const FAILED_UPGRADE_MS = 6000;
/**
 * Frame gaps longer than this (returning to a hidden tab, a shader compile) are ignored. Kept
 * generous so a genuinely slow GPU (a few fps) still counts as slow and gets stepped down.
 */
const MAX_SAMPLE_MS = 1000;

export class QualityGovernor {
  level: number;
  private readonly startLevel: number;
  private clock = 0;
  private windowMs = 0;
  private windowFrames = 0;
  private slowWindows = 0;
  private goodMs = 0;
  private upgradeAfterMs = UPGRADE_AFTER_MS;
  private lastUpgradeAt = -Infinity;

  constructor(startLevel = 0) {
    this.startLevel = Math.min(Math.max(0, startLevel), AUTO_TIERS.length - 1);
    this.level = this.startLevel;
  }

  get tier(): QualityTier {
    return AUTO_TIERS[this.level];
  }

  /** Back to the starting tier with a clean history. */
  reset(): void {
    this.level = this.startLevel;
    this.upgradeAfterMs = UPGRADE_AFTER_MS;
    this.lastUpgradeAt = -Infinity;
    this.restartMeasuring();
  }

  /** Forget the current measurement window (after a resize or context restore). */
  restartMeasuring(): void {
    this.windowMs = 0;
    this.windowFrames = 0;
    this.slowWindows = 0;
    this.goodMs = 0;
  }

  /** Feed one frame's duration in ms. Returns true when the tier changed. */
  sample(frameMs: number): boolean {
    if (!(frameMs > 0) || frameMs > MAX_SAMPLE_MS) return false;
    this.clock += frameMs;
    this.windowMs += frameMs;
    this.windowFrames++;
    if (this.windowMs < WINDOW_MS) return false;

    const windowLength = this.windowMs;
    const average = windowLength / this.windowFrames;
    this.windowMs = 0;
    this.windowFrames = 0;

    if (average > SLOW_FRAME_MS) {
      this.goodMs = 0;
      if (++this.slowWindows < SLOW_WINDOWS || this.level >= AUTO_TIERS.length - 1) return false;
      this.slowWindows = 0;
      if (this.clock - this.lastUpgradeAt < FAILED_UPGRADE_MS) {
        this.upgradeAfterMs = Math.min(this.upgradeAfterMs * 2, MAX_UPGRADE_AFTER_MS);
      }
      this.level++;
      return true;
    }

    this.slowWindows = 0;
    if (average > GOOD_FRAME_MS) {
      this.goodMs = 0;
      return false;
    }
    this.goodMs += windowLength;
    if (this.goodMs < this.upgradeAfterMs || this.level === 0) return false;
    this.goodMs = 0;
    this.level--;
    this.lastUpgradeAt = this.clock;
    return true;
  }
}
