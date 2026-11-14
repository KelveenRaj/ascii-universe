import type { TextLayer, TextStyle } from '@/engine/display/TextLayer';

/** Seconds. The scene swaps at the midpoint, while the screen is dark and full of streaks. */
export const WARP_DURATION = 1.6;
/** With reduced motion: a quick fade, no streaks. */
export const WARP_DURATION_REDUCED = 0.5;
const STREAKS = 110;

interface Streak {
  angle: number;
  /** Starting distance from the centre, as a fraction of the half-diagonal. */
  start: number;
  speed: number;
}

/** Small deterministic PRNG (mulberry32), so every warp looks the same. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The ASCII line character closest to a direction (screen space, y down). */
export function streakChar(dx: number, dy: number): string {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > 2.2 * ay) return '-';
  if (ay > 2.2 * ax) return '|';
  return dx * dy > 0 ? '\\' : '/';
}

/**
 * The warp transition: the scene fades out while star streaks rush past (drawn as - | / \ into
 * the text layer), the scene is swapped at the midpoint, then the streaks thin out and the new
 * scene fades in. The engine owns the swap; this only keeps time and draws.
 */
export class Warp {
  readonly duration: number;
  private t = 0;
  private swapped = false;
  private readonly streaks: Streak[];

  /**
   * @param caption shown in the middle of the screen, e.g. "WARP > SGR A*"
   * @param reducedMotion a short fade without streaks
   */
  readonly caption: string;
  private readonly reducedMotion: boolean;

  constructor(caption: string, reducedMotion = false) {
    this.caption = caption;
    this.reducedMotion = reducedMotion;
    this.duration = reducedMotion ? WARP_DURATION_REDUCED : WARP_DURATION;
    const rand = rng(0x5eed);
    this.streaks = Array.from({ length: STREAKS }, () => ({
      angle: rand() * Math.PI * 2,
      start: 0.04 + rand() * 0.5,
      speed: 0.6 + rand() * 0.8,
    }));
  }

  update(dt: number): void {
    this.t = Math.min(this.duration, this.t + dt);
  }

  /** 0..1 through the warp. */
  get progress(): number {
    return this.t / this.duration;
  }

  /** True once, at the midpoint: the engine swaps scenes then. */
  takeSwap(): boolean {
    if (this.swapped || this.progress < 0.5) return false;
    this.swapped = true;
    return true;
  }

  get done(): boolean {
    return this.t >= this.duration;
  }

  /** Scene brightness: 1 → 0 by the midpoint → back to 1. */
  get fade(): number {
    const p = this.progress;
    return p < 0.5 ? 1 - smoothstep(0.05, 0.45, p) : smoothstep(0.6, 0.95, p);
  }

  /** Draws streaks and the caption into the text layer (call after it has been cleared). */
  draw(text: TextLayer): void {
    const { cols, rows } = text;
    if (cols === 0 || rows === 0) return;
    const cx = cols / 2;
    const cy = rows / 2;
    const p = this.progress;

    if (!this.reducedMotion) {
      // speed builds up to the midpoint and dies away after it
      const intensity = p < 0.5 ? smoothstep(0, 0.5, p) : 1 - smoothstep(0.5, 1, p);
      // distance travelled: the integral of the speed, so streaks never run backwards
      const travel = p < 0.5 ? p * p * 4 : 1 + (p - 0.5) * 2 - (p - 0.5) * (p - 0.5) * 2;
      const halfDiag = Math.hypot(cx, cy);
      for (const s of this.streaks) {
        // each streak loops outward from the centre; travel moves it along
        const r = ((s.start + travel * s.speed * 1.4) % 1.2) * halfDiag;
        const len = (1 + intensity * 14) * s.speed * (r / halfDiag + 0.15);
        if (intensity < 0.05) continue;
        const dx = Math.cos(s.angle);
        const dy = Math.sin(s.angle);
        const ch = streakChar(dx, dy);
        const steps = Math.ceil(len);
        for (let i = 0; i <= steps; i++) {
          const d = r - i;
          if (d < 2) break;
          const style: TextStyle = i === 0 ? 'bright' : i < steps / 2 ? 'normal' : 'dim';
          text.put(Math.floor(cx + dx * d), Math.floor(cy + dy * d), i === 0 ? '+' : ch, style);
        }
      }
    }

    const label = ` ${this.caption} `;
    text.put(Math.floor(cx - label.length / 2), Math.floor(cy), label, 'bright');
  }
}
