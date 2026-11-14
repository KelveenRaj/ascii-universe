import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pathTo } from '@/content/catalog';
import { cellAt, computeGrid } from '@/engine/display/grid';
import { drawLabel } from '@/engine/display/labels';
import { createPaletteTexture, updatePaletteTexture } from '@/engine/display/palette/lut';
import type { Ramp } from '@/engine/display/palette/palettes';
import { TextLayer } from '@/engine/display/TextLayer';
import { streakChar, Warp, WARP_DURATION, WARP_DURATION_REDUCED } from '@/engine/transition/Warp';
import { GALAXY, galaxyToWorld } from '@/scenes/milky-way/layout';

const run = (warp: Warp, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) warp.update(dt);
};

describe('warp timing', () => {
  it('fades out, swaps once at the midpoint while dark, then fades back in', () => {
    const warp = new Warp('WARP > X');
    expect(warp.duration).toBe(WARP_DURATION);
    expect(warp.fade).toBe(1);
    let swaps = 0;
    let fadeAtSwap = -1;
    while (!warp.done) {
      warp.update(1 / 60);
      if (warp.takeSwap()) {
        swaps++;
        fadeAtSwap = warp.fade;
      }
    }
    expect(swaps).toBe(1);
    expect(fadeAtSwap).toBe(0);
    expect(warp.fade).toBe(1);
    expect(warp.takeSwap()).toBe(false);
  });

  it('survives big frame gaps', () => {
    const warp = new Warp('WARP > X');
    warp.update(10);
    expect(warp.done).toBe(true);
    expect(warp.takeSwap()).toBe(true);
  });

  it('is short with reduced motion, and then draws no streaks', () => {
    const warp = new Warp('WARP > X', true);
    expect(warp.duration).toBe(WARP_DURATION_REDUCED);
    run(warp, warp.duration / 2);
    const text = new TextLayer();
    text.resize(40, 20);
    warp.draw(text);
    let cells = 0;
    for (let r = 0; r < 20; r++) for (let c = 0; c < 40; c++) if (text.charAt(c, r)) cells++;
    expect(cells).toBe(' WARP > X '.length);
  });

  it('draws streaks and the caption mid-warp', () => {
    const warp = new Warp('WARP > SGR A*');
    run(warp, WARP_DURATION * 0.45);
    const text = new TextLayer();
    text.resize(80, 40);
    warp.draw(text);
    let row = '';
    for (let c = 0; c < 80; c++) row += text.charAt(c, 20) || ' ';
    expect(row).toContain('WARP > SGR A*');
    const chars = new Set<string>();
    for (let r = 0; r < 40; r++) for (let c = 0; c < 80; c++) chars.add(text.charAt(c, r));
    for (const ch of ['+', '-', '|']) expect(chars).toContain(ch);
  });

  it('picks line characters by direction (screen y down)', () => {
    expect(streakChar(1, 0)).toBe('-');
    expect(streakChar(0, -1)).toBe('|');
    expect(streakChar(1, 1)).toBe('\\');
    expect(streakChar(1, -1)).toBe('/');
  });
});

describe('clicking cells', () => {
  it('maps pixels to cells, row 0 at the top, null outside the grid', () => {
    const grid = computeGrid(1285, 725, 1); // 160×90 cells of 8 px, 2–3 px of margin
    expect(cellAt(grid, 725, grid.offsetX, 725 - grid.offsetY - 1)).toEqual({ col: 0, row: 89 });
    expect(cellAt(grid, 725, grid.offsetX + 8 * 159 + 7, 725 - grid.offsetY - 90 * 8 + 1)).toEqual({
      col: 159,
      row: 0,
    });
    expect(cellAt(grid, 725, 0, 0)).toBeNull();
  });

  it('labels report the cells they cover', () => {
    const text = new TextLayer();
    text.resize(60, 30);
    const cam = new THREE.PerspectiveCamera(50, 2, 0.1, 1000);
    cam.position.set(0, 0, 30);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    const tan = Math.tan((50 * Math.PI) / 360);
    const rect = drawLabel(
      text,
      { position: new THREE.Vector3(), text: 'AB', radius: 1 },
      cam,
      tan,
    )!;
    expect(text.charAt(rect.col0, rect.row0)).toBe('┌');
    expect(text.charAt(rect.col1, rect.row0)).toBe('B');
    expect(text.charAt(rect.col0, rect.row1)).toBe('└');
    const behind = new THREE.Vector3(0, 0, 60);
    expect(drawLabel(text, { position: behind, text: 'X' }, cam, tan)).toBeNull();
  });
});

describe('scene changes', () => {
  it('the palette texture can change its row count', () => {
    const ramp: Ramp = {
      stops: [
        [0, '#000000'],
        [1, '#ffffff'],
      ],
      interpolation: 'srgb',
    };
    const tex = createPaletteTexture([ramp]);
    updatePaletteTexture(tex, [ramp, ramp, ramp]);
    expect(tex.image.height).toBe(3);
    expect((tex.image.data as Uint8Array).length).toBe(256 * 3 * 4);
    expect(() => updatePaletteTexture(tex, [])).toThrow();
  });

  it('the catalog path runs from the hub down', () => {
    expect(pathTo('sgr-a-star').map((b) => b.id)).toEqual(['milky-way', 'sgr-a-star']);
    expect(pathTo('milky-way').map((b) => b.id)).toEqual(['milky-way']);
    expect(pathTo('nowhere')).toEqual([]);
  });

  it('the Sun label sits 27 kly out and turns with the galaxy', () => {
    const p0 = galaxyToWorld(GALAXY.sunRadius, GALAXY.sunAngle, 0);
    const p1 = galaxyToWorld(GALAXY.sunRadius, GALAXY.sunAngle, Math.PI / 2);
    expect(p0.length()).toBeCloseTo(27, 9);
    expect(p0.z).toBeCloseTo(27, 9);
    expect(p1.x).toBeCloseTo(27, 9); // turned a quarter: +Z → +X
  });
});
