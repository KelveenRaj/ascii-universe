import * as THREE from 'three';
import type { Ramp } from '@/engine/display/palette/palettes';

export const LUT_SIZE = 256;

export type Rgb = [number, number, number];

/** '#rrggbb' → [r, g, b] in 0..1 (display / sRGB values). */
export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Bad hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Relative luminance (Rec. 709) of a display-space colour, computed in linear light. */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Samples a ramp at t ∈ [0, 1]; returns a display-space (sRGB) colour. */
export function sampleRamp(ramp: Ramp, t: number): Rgb {
  const stops = ramp.stops;
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
  const [t0, h0] = stops[i];
  const [t1, h1] = stops[i + 1];
  const f = t1 > t0 ? (x - t0) / (t1 - t0) : 0;
  const a = hexToRgb(h0);
  const b = hexToRgb(h1);
  if (ramp.interpolation === 'srgb') {
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  return [0, 1, 2].map((k) => {
    const la = srgbToLinear(a[k]);
    const lb = srgbToLinear(b[k]);
    return linearToSrgb(la + (lb - la) * f);
  }) as Rgb;
}

/** RGBA8 bytes, LUT_SIZE texels, display-space values (shaders write them straight to the screen). */
export function buildLut(ramp: Ramp): Uint8Array {
  const data = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const c = sampleRamp(ramp, i / (LUT_SIZE - 1));
    data[i * 4 + 0] = Math.round(c[0] * 255);
    data[i * 4 + 1] = Math.round(c[1] * 255);
    data[i * 4 + 2] = Math.round(c[2] * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** One LUT row per material, stacked: row i is material i of the active scene. */
export function buildPaletteRows(ramps: readonly Ramp[]): Uint8Array {
  const data = new Uint8Array(LUT_SIZE * 4 * ramps.length);
  ramps.forEach((ramp, row) => data.set(buildLut(ramp), row * LUT_SIZE * 4));
  return data;
}

/**
 * The palette texture: LUT_SIZE × (number of materials). Linear along brightness, nearest between
 * rows so materials never bleed into each other.
 */
export function createPaletteTexture(ramps: readonly Ramp[]): THREE.DataTexture {
  if (ramps.length === 0) throw new Error('A palette needs at least one ramp');
  const tex = new THREE.DataTexture(
    buildPaletteRows(ramps),
    LUT_SIZE,
    ramps.length,
    THREE.RGBAFormat,
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Rewrites the rows in place. The row count must match (a new scene gets a new texture). */
export function updatePaletteTexture(tex: THREE.DataTexture, ramps: readonly Ramp[]): void {
  if (tex.image.height !== ramps.length) throw new Error('Palette row count changed');
  (tex.image.data as Uint8Array).set(buildPaletteRows(ramps));
  tex.needsUpdate = true;
}
