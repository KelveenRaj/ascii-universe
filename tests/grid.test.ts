import { describe, expect, it } from 'vitest';
import { autoGlyphScale, computeGrid } from '@/renderer/grid';

describe('character grid', () => {
  it('auto scale lands around 120–160 columns on common screens', () => {
    for (const w of [1280, 1920, 2560, 3840]) {
      const g = computeGrid(w, Math.round((w * 9) / 16), 0);
      expect(g.scale).toBe(autoGlyphScale(w));
      expect(g.cols).toBeGreaterThanOrEqual(120);
      expect(g.cols).toBeLessThanOrEqual(240);
    }
  });

  it('uses integer cell sizes and centres the leftover pixels', () => {
    const g = computeGrid(1000, 500, 3); // 24 px cells
    expect(g.cellPx).toBe(24);
    expect(g.cols).toBe(41); // 984 px used, 16 left over
    expect(g.rows).toBe(20); // 480 px used, 20 left over
    expect(g.offsetX).toBe(8);
    expect(g.offsetY).toBe(10);
  });

  it('custom columns fit the width exactly', () => {
    const g = computeGrid(1920, 1080, 0, 200);
    expect(g.cols).toBe(200);
    expect(g.cellPx).toBeCloseTo(9.6);
    expect(g.scale).toBeCloseTo(1.2);
    expect(g.rows).toBe(112);
    expect(g.offsetX).toBe(0);
  });

  it('custom columns never shrink cells below 4 px', () => {
    const g = computeGrid(400, 300, 0, 400);
    expect(g.cellPx).toBe(4);
    expect(g.cols).toBe(100);
  });

  it('never returns an empty grid', () => {
    const g = computeGrid(3, 3, 4);
    expect(g.cols).toBe(1);
    expect(g.rows).toBe(1);
  });
});
