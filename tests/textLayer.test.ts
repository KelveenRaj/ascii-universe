import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GLYPH_SIZE, PROCEDURAL_GLYPHS } from '@/engine/display/glyphs/bitmaps';
import { TEXT_CHARS } from '@/engine/display/glyphs/ramps';
import { drawLabel, projectToGrid } from '@/engine/display/labels';
import { TEXT_STYLES, TextLayer, textCode } from '@/engine/display/TextLayer';

const TAN_HALF_FOV = Math.tan((50 * Math.PI) / 360);

function layer(cols = 40, rows = 20): TextLayer {
  const t = new TextLayer();
  t.resize(cols, rows);
  return t;
}

/** Text of one row, empty cells as '.'. */
function rowText(t: TextLayer, row: number): string {
  let s = '';
  for (let c = 0; c < t.cols; c++) s += t.charAt(c, row) || '.';
  return s;
}

/** Camera at (0, 0, distance) looking at the origin, like the black hole's face-on views. */
function cameraAt(distance: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  cam.position.set(0, 0, distance);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

describe('text codes', () => {
  it('covers printable ASCII and the bracket corners, with 0 meaning empty', () => {
    expect(TEXT_CHARS).toHaveLength(99);
    expect(textCode(' ')).toBe(1);
    expect(textCode('A')).toBe(1 + 'A'.charCodeAt(0) - 32);
    expect(textCode('┘')).toBe(99);
    expect(textCode('é')).toBe(textCode('?'));
  });

  it('bracket corners are drawn procedurally, as mirror images', () => {
    const at = (ch: string, x: number, y: number) => PROCEDURAL_GLYPHS[ch]()[y * GLYPH_SIZE + x];
    const last = GLYPH_SIZE - 1;
    expect(at('┌', 0, 0)).toBe(1);
    expect(at('┌', last, last)).toBe(0);
    expect(at('┘', last, last)).toBe(1);
    expect(at('┘', 0, 0)).toBe(0);
    for (let y = 0; y < GLYPH_SIZE; y++) {
      for (let x = 0; x < GLYPH_SIZE; x++) {
        expect(at('┐', x, y)).toBe(at('┌', last - x, y));
        expect(at('└', x, y)).toBe(at('┌', x, last - y));
      }
    }
  });
});

describe('TextLayer', () => {
  it('writes left to right, row 0 at the top, clipping at the edges', () => {
    const t = layer(10, 3);
    t.put(-2, 0, 'HELLO');
    t.put(7, 2, 'WORLD');
    t.put(0, 5, 'OFF GRID');
    expect(rowText(t, 0)).toBe('LLO.......');
    expect(rowText(t, 1)).toBe('..........');
    expect(rowText(t, 2)).toBe('.......WOR');
  });

  it('stores cells bottom row first (GL order) with the style index', () => {
    const t = layer(4, 2);
    t.put(1, 0, 'A', 'accent'); // top row → second half of the data
    expect(t.data[(1 * 4 + 1) * 2]).toBe(textCode('A'));
    expect(t.data[(1 * 4 + 1) * 2 + 1]).toBe(TEXT_STYLES.indexOf('accent'));
    expect(t.data[(0 * 4 + 1) * 2]).toBe(0);
  });

  it('clears, and resizing starts empty', () => {
    const t = layer(4, 2);
    t.put(0, 0, 'AB');
    expect(t.isEmpty()).toBe(false);
    t.clear();
    expect(t.isEmpty()).toBe(true);
    t.put(0, 0, 'AB');
    t.resize(8, 4);
    expect(t.isEmpty()).toBe(true);
    expect(t.data.length).toBe(8 * 4 * 2);
  });
});

describe('projecting to the grid', () => {
  it('puts the look-at point in the centre cell', () => {
    const p = projectToGrid(new THREE.Vector3(), cameraAt(20), TAN_HALF_FOV, 40, 20)!;
    expect(p.col).toBe(20);
    expect(p.row).toBe(9); // row 10 from the bottom = row 9 from the top
  });

  it('right is right and up is up', () => {
    const cam = cameraAt(20);
    const c = projectToGrid(new THREE.Vector3(), cam, TAN_HALF_FOV, 40, 20)!;
    const right = projectToGrid(new THREE.Vector3(3, 0, 0), cam, TAN_HALF_FOV, 40, 20)!;
    const up = projectToGrid(new THREE.Vector3(0, 3, 0), cam, TAN_HALF_FOV, 40, 20)!;
    expect(right.col).toBeGreaterThan(c.col);
    expect(up.row).toBeLessThan(c.row);
  });

  it('scales with distance: twice as far is half as many cells per unit', () => {
    const near = projectToGrid(new THREE.Vector3(), cameraAt(10), TAN_HALF_FOV, 40, 20)!;
    const far = projectToGrid(new THREE.Vector3(), cameraAt(20), TAN_HALF_FOV, 40, 20)!;
    expect(near.cellsPerUnit).toBeCloseTo(2 * far.cellsPerUnit, 9);
  });

  it('ignores points behind the camera', () => {
    expect(projectToGrid(new THREE.Vector3(0, 0, 30), cameraAt(20), TAN_HALF_FOV, 40, 20)).toBe(
      null,
    );
  });
});

describe('drawing labels', () => {
  it('frames the object with corners and puts the name top-right', () => {
    const t = layer(60, 30);
    const cam = cameraAt(26);
    drawLabel(t, { position: new THREE.Vector3(), text: 'SGR A*', radius: 2.6 }, cam, TAN_HALF_FOV);
    const c = projectToGrid(new THREE.Vector3(), cam, TAN_HALF_FOV, 60, 30)!;
    const r = Math.max(2, Math.ceil(2.6 * c.cellsPerUnit) + 1);
    expect(t.charAt(c.col - r, c.row - r)).toBe('┌');
    expect(t.charAt(c.col + r, c.row - r)).toBe('┐');
    expect(t.charAt(c.col - r, c.row + r)).toBe('└');
    expect(t.charAt(c.col + r, c.row + r)).toBe('┘');
    expect(rowText(t, c.row - r)).toContain('┐.SGR A*');
  });

  it('centres a plain tag on the point', () => {
    const t = layer(41, 21);
    drawLabel(t, { position: new THREE.Vector3(), text: 'SUN' }, cameraAt(20), TAN_HALF_FOV);
    expect(rowText(t, 10)).toBe('.'.repeat(19) + 'SUN' + '.'.repeat(19));
  });

  it('skips brackets when the object fills the view', () => {
    const t = layer(40, 20);
    drawLabel(
      t,
      { position: new THREE.Vector3(), text: 'BIG', radius: 50 },
      cameraAt(3),
      TAN_HALF_FOV,
    );
    expect(t.isEmpty()).toBe(true);
  });
});
