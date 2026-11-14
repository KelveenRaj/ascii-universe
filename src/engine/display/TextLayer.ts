import * as THREE from 'three';
import { TEXT_CHARS } from '@/engine/display/glyphs/ramps';

/**
 * Text colours, picked from the active palette (see DisplayPipeline): bright and normal ink, dim,
 * and an accent. Indices match uTextColors in ascii.frag.
 */
export const TEXT_STYLES = ['bright', 'normal', 'dim', 'accent'] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];

const CODE_FOR = new Map(TEXT_CHARS.map((ch, i) => [ch, i + 1]));
const UNKNOWN = CODE_FOR.get('?')!;

/** Text-layer code for a character: 1 + its index in TEXT_CHARS; unknown characters become '?'. */
export function textCode(ch: string): number {
  return CODE_FOR.get(ch) ?? UNKNOWN;
}

/**
 * Characters drawn on top of the scene in the same character grid: labels, target brackets, and
 * later game sprites and in-grid HUD text. A text cell replaces the scene glyph in that cell, on
 * the background colour, so it stays readable over a bright disk. Copy as text includes it.
 *
 * Coordinates are (col, row) with row 0 at the TOP, like text. Anything outside the grid is
 * clipped. Only drawn in ASCII mode.
 *
 * Storage: two bytes per cell, bottom row first (GL order): code (0 = empty) and style index.
 */
export class TextLayer {
  cols = 0;
  rows = 0;
  data = new Uint8Array(0);
  texture: THREE.DataTexture;
  private dirty = true;

  constructor() {
    this.texture = this.makeTexture();
  }

  /** Matches the character grid; clears everything. */
  resize(cols: number, rows: number): void {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.data = new Uint8Array(Math.max(1, cols * rows) * 2);
    this.texture.dispose();
    this.texture = this.makeTexture();
    this.dirty = true;
  }

  clear(): void {
    if (this.isEmpty()) return;
    this.data.fill(0);
    this.dirty = true;
  }

  isEmpty(): boolean {
    for (let i = 0; i < this.data.length; i += 2) if (this.data[i] !== 0) return false;
    return true;
  }

  /** Writes text left to right from (col, row). Characters off the grid are skipped. */
  put(col: number, row: number, text: string, style: TextStyle = 'normal'): void {
    const c0 = Math.round(col);
    const r = Math.round(row);
    if (r < 0 || r >= this.rows) return;
    const styleIndex = TEXT_STYLES.indexOf(style);
    let c = c0;
    for (const ch of text) {
      if (c >= 0 && c < this.cols) {
        const i = this.index(c, r);
        this.data[i] = textCode(ch);
        this.data[i + 1] = styleIndex;
        this.dirty = true;
      }
      c++;
    }
  }

  /** The character at (col, row), or '' if the cell is empty or off the grid. */
  charAt(col: number, row: number): string {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return '';
    const code = this.data[this.index(col, row)];
    return code === 0 ? '' : TEXT_CHARS[code - 1];
  }

  /** Uploads the cells if anything changed since the last upload. */
  upload(): void {
    if (!this.dirty) return;
    (this.texture.image.data as Uint8Array).set(this.data);
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  dispose(): void {
    this.texture.dispose();
  }

  private index(col: number, row: number): number {
    return ((this.rows - 1 - row) * this.cols + col) * 2;
  }

  private makeTexture(): THREE.DataTexture {
    const tex = new THREE.DataTexture(
      new Uint8Array(this.data.length || 2),
      Math.max(1, this.cols),
      Math.max(1, this.rows),
      THREE.RGFormat,
      THREE.UnsignedByteType,
    );
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return tex;
  }
}
