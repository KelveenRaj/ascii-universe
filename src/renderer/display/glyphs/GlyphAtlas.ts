import * as THREE from 'three';
import {
  type Bitmap,
  type Box,
  coverage,
  cropThreshold,
  cropWindow,
  ditherBitmap,
  GLYPH_SIZE,
  inkBox,
  PROCEDURAL_GLYPHS,
  unionBox,
} from '@/renderer/display/glyphs/bitmaps';
import { sortByCoverage, STAR_RAMP, uniqueChars } from '@/renderer/display/glyphs/ramps';

const FONT_FAMILY = '"Press Start 2P"';
/** Glyphs are drawn this many times larger than their 8 px design size, then sampled per block. */
const UPSCALE = 8;
const FONT = `${8 * UPSCALE}px ${FONT_FAMILY}`;
/** Printable ASCII: defines the shared crop window so every glyph sits on the same baseline. */
const REFERENCE_CHARS = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i)).join('');
// scratch canvas, in screen pixels; the glyph origin sits well inside it
const SCRATCH = 16 * UPSCALE;
const ORIGIN_X = 4 * UPSCALE;
const BASELINE_Y = 12 * UPSCALE;

/** Resolves true once the pixel font is usable by canvas text rendering. */
export async function loadPixelFont(): Promise<boolean> {
  try {
    await document.fonts.load(`8px ${FONT_FAMILY}`, REFERENCE_CHARS);
    return document.fonts.check(`8px ${FONT_FAMILY}`, 'A');
  } catch {
    return false;
  }
}

/**
 * Rasterises glyphs from the pixel font. Each glyph is drawn 8× larger and every design pixel is read
 * at the centre of its 8×8 block, so antialiasing and sub-pixel placement cannot merge or fatten
 * strokes: the result is the exact 1-bit design. Falls back to dither blocks if the font is missing.
 */
export class GlyphRasterizer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly fontReady: boolean;
  private readonly window: { x: number; y: number } | null = null;
  private readonly cache = new Map<string, Bitmap>();

  constructor(fontReady: boolean) {
    const canvas = document.createElement('canvas');
    canvas.width = SCRATCH;
    canvas.height = SCRATCH;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.fontReady = fontReady && this.ctx !== null;

    if (this.fontReady) {
      let union: Box | null = null;
      for (const ch of REFERENCE_CHARS) union = unionBox(union, this.ink(ch));
      if (union) {
        // crop window in design pixels, then back to screen pixels
        const w = cropWindow({
          x0: 0,
          y0: 0,
          x1: Math.round((union.x1 - union.x0) / UPSCALE),
          y1: Math.round((union.y1 - union.y0) / UPSCALE),
        });
        this.window = { x: union.x0 + w.x * UPSCALE, y: union.y0 + w.y * UPSCALE };
      }
    }
  }

  private draw(ch: string): Uint8ClampedArray {
    const ctx = this.ctx!;
    ctx.clearRect(0, 0, SCRATCH, SCRATCH);
    ctx.font = FONT;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, ORIGIN_X, BASELINE_Y);
    return ctx.getImageData(0, 0, SCRATCH, SCRATCH).data;
  }

  private ink(ch: string): Box | null {
    return inkBox(this.draw(ch), SCRATCH, SCRATCH);
  }

  bitmap(ch: string, fallbackFill: number): Bitmap {
    const cached = this.cache.get(ch);
    if (cached) return cached;
    let bm: Bitmap;
    const procedural = PROCEDURAL_GLYPHS[ch];
    if (procedural) bm = procedural();
    else if (this.fontReady && this.window) {
      bm = cropThreshold(
        this.draw(ch),
        SCRATCH,
        SCRATCH,
        this.window.x,
        this.window.y,
        128,
        UPSCALE,
      );
    } else bm = ditherBitmap(fallbackFill);
    this.cache.set(ch, bm);
    return bm;
  }
}

export interface GlyphAtlas {
  texture: THREE.DataTexture;
  /** Ramp glyphs (sorted darkest first) followed by star glyphs. */
  glyphs: string[];
  rampLength: number;
  starBase: number;
  starLength: number;
}

/** Builds a one-row atlas: [ramp glyphs…, star glyphs…], each 8×8, as an R8 texture. */
export function buildGlyphAtlas(rasterizer: GlyphRasterizer, rampChars: string): GlyphAtlas {
  const raw = uniqueChars(rampChars);
  const fill = (ch: string) => {
    const i = raw.indexOf(ch);
    return raw.length > 1 ? i / (raw.length - 1) : 1;
  };
  const ramp = sortByCoverage(raw, (ch) => coverage(rasterizer.bitmap(ch, fill(ch))));
  const stars = uniqueChars(STAR_RAMP);
  const glyphs = [...ramp, ...stars];

  const width = glyphs.length * GLYPH_SIZE;
  const data = new Uint8Array(width * GLYPH_SIZE);
  glyphs.forEach((ch, g) => {
    const bm = rasterizer.bitmap(ch, g < ramp.length ? fill(ch) : 0.25);
    for (let y = 0; y < GLYPH_SIZE; y++) {
      for (let x = 0; x < GLYPH_SIZE; x++) {
        data[y * width + g * GLYPH_SIZE + x] = bm[y * GLYPH_SIZE + x] * 255;
      }
    }
  });

  const texture = new THREE.DataTexture(data, width, GLYPH_SIZE, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;

  return {
    texture,
    glyphs,
    rampLength: ramp.length,
    starBase: ramp.length,
    starLength: stars.length,
  };
}
