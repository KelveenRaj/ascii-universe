/**
 * Deterministic randomness for the procedural galaxy. The same inputs must give the same star
 * systems on every machine and every release of a generator version, so this is integer-only
 * (Math.imul and 32-bit shifts behave identically everywhere) and never touches Math.random.
 */

/** A 32-bit avalanche mix (the murmur3 finaliser). */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash of a list of integers (e.g. generator version and sector coordinates) to an unsigned 32-bit seed. */
export function hashInts(...values: number[]): number {
  let h = 0x9e3779b9 ^ values.length;
  for (const v of values) {
    h = fmix32((h ^ (v | 0)) + 0x7f4a7c15);
  }
  return h;
}

/** Hash of a string to an unsigned 32-bit seed (FNV-1a over UTF-16 code units, then mixed). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  }
  return fmix32(h);
}

/** A seeded random stream (mulberry32). Each call returns a float in [0, 1). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max] (both inclusive). */
export const randInt = (rng: Rng, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

/** One item of a non-empty list, picked uniformly. */
export const pick = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

/** An index into `weights`, picked with probability proportional to each weight. */
export function pickWeighted(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}
