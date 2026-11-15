import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { textColors } from '@/engine/display/DisplayPipeline';
import { TEXT_CHARS } from '@/engine/display/glyphs/ramps';
import { hexToRgb } from '@/engine/display/palette/lut';
import { PALETTES } from '@/engine/display/palette/palettes';
import { TEXT_STYLES, TEXT_SWATCHES, TextLayer } from '@/engine/display/TextLayer';
import { MILKY_WAY_MATERIALS } from '@/scenes/milky-way/materials';
import { axisToCell, composeShip, shipViews } from '@/world/ship/compose';
import {
  DEFAULT_SHIP,
  ENGINES,
  HULLS,
  sanitizeShip,
  SHIP_COLORS,
  TRAIL_GLYPHS,
  WINGS,
  type ShipDesign,
} from '@/world/ship/design';
import { SIDE, Trail } from '@/world/ship/sprite';

const ALL = HULLS.flatMap((hull) =>
  WINGS.flatMap((wings) => ENGINES.map((engine) => ({ hull, wings, engine }))),
);

describe('ship parts', () => {
  it('draws the default ship exactly like the classic sprite, side-on in every direction', () => {
    const views = composeShip(DEFAULT_SHIP);
    for (let dir = 0; dir < 8; dir++) {
      const got = views.side[dir].map((c) => `${c.dc},${c.dr},${c.ch}`).sort();
      const want = SIDE[dir].map(([dc, dr, ch]) => `${dc},${dr},${ch}`).sort();
      expect(got, `direction ${dir}`).toEqual(want);
    }
  });

  it('has all 10 views for every combination, centred, in drawable characters', () => {
    const drawable = new Set(TEXT_CHARS);
    for (const design of ALL) {
      const v = composeShip(design);
      const views = [...v.side, v.rear, v.front];
      expect(views).toHaveLength(10);
      for (const cells of views) {
        expect(cells.some((c) => c.dc === 0 && c.dr === 0)).toBe(true);
        for (const c of cells) {
          expect(drawable.has(c.ch), `${c.ch} in ${JSON.stringify(design)}`).toBe(true);
          // small enough to read as one ship on a coarse grid
          expect(Math.abs(c.dc)).toBeLessThanOrEqual(3);
          expect(Math.abs(c.dr)).toBeLessThanOrEqual(3);
        }
        const spots = cells.map((c) => `${c.dc},${c.dr}`);
        expect(new Set(spots).size).toBe(spots.length);
      }
    }
  });

  it('puts the exhaust behind the ship, never on it', () => {
    for (const design of ALL) {
      const v = composeShip(design);
      for (let dir = 0; dir < 8; dir++) {
        const ship = new Set(v.side[dir].map((c) => `${c.dc},${c.dr}`));
        for (const [dc, dr] of v.exhaustSide[dir]) expect(ship.has(`${dc},${dr}`)).toBe(false);
      }
      const rear = new Set(v.rear.map((c) => `${c.dc},${c.dr}`));
      for (const [dc, dr] of v.exhaustRear) expect(rear.has(`${dc},${dr}`)).toBe(false);
    }
  });

  it('maps ship axes to screen cells', () => {
    expect(axisToCell(0, 1, 0)).toEqual([1, 0]); // nose, flying right
    expect(axisToCell(0, 0, 1)).toEqual([0, -1]); // left is up
    expect(axisToCell(2, 1, 0)).toEqual([0, -1]); // flying up
    expect(axisToCell(1, -1, 1)).toEqual([-1, 0]);
    expect(axisToCell(1, -1, -1)).toEqual([0, 1]);
  });

  it('remembers composed ships', () => {
    const red: ShipDesign = { ...DEFAULT_SHIP, color: 'red' };
    expect(shipViews(DEFAULT_SHIP)).toBe(shipViews(red));
  });
});

describe('ship colours', () => {
  it('has a text swatch for every ship colour, in the same order', () => {
    expect(TEXT_SWATCHES.map((s) => s.id)).toEqual([...SHIP_COLORS]);
    expect(TEXT_STYLES).toHaveLength(16);
  });

  it('uses the true colours under natural colours, palette tones otherwise', () => {
    const main = MILKY_WAY_MATERIALS[0].ramp;
    const natural = textColors(null, main);
    expect(natural).toHaveLength(16);
    expect(natural[4]).toEqual(hexToRgb(TEXT_SWATCHES[0].hex));
    const green = textColors(PALETTES.green.ramp, main);
    expect(green).toHaveLength(16);
    // a one-colour terminal: every swatch is a shade of its green
    for (const [r, g, b] of green.slice(4)) expect(g).toBeGreaterThanOrEqual(Math.max(r, b));
  });

  it('stores swatch styles in the text layer', () => {
    const t = new TextLayer();
    t.resize(4, 1);
    t.put(0, 0, 'O', 'swatch:cyan');
    expect(t.charAt(0, 0)).toBe('O');
    const styleIndex = t.data[1];
    expect(TEXT_STYLES[styleIndex]).toBe('swatch:cyan');
    t.dispose();
  });
});

describe('ship designs', () => {
  it('survive a save and load', () => {
    const designs: ShipDesign[] = ALL.map((d, i) => ({
      ...DEFAULT_SHIP,
      ...d,
      name: `SHIP ${i}`,
      color: SHIP_COLORS[i % SHIP_COLORS.length],
      trail: {
        glyph: TRAIL_GLYPHS[i % TRAIL_GLYPHS.length],
        color: SHIP_COLORS[(i * 5) % SHIP_COLORS.length],
        length: (i % 3) as 0 | 1 | 2,
      },
    }));
    for (const d of designs) expect(sanitizeShip(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

describe('engine trail', () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.001, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const tan = Math.tan((25 * Math.PI) / 180);
  const count = (t: TextLayer) => {
    let n = 0;
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) if (t.charAt(c, r)) n++;
    return n;
  };

  it('leaves a line of glyphs behind a moving ship, as long as the design says', () => {
    const trail = new Trail();
    const p = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      p.set(-2 + i * 0.1, 0, 0);
      trail.update(0.15, p, true);
    }
    const text = new TextLayer();
    text.resize(80, 40);
    trail.draw(text, camera, tan, { glyph: 'dots', color: 'amber', length: 2 }, null);
    const long = count(text);
    text.clear();
    trail.draw(text, camera, tan, { glyph: 'dots', color: 'amber', length: 1 }, null);
    const short = count(text);
    text.clear();
    trail.draw(text, camera, tan, { glyph: 'dots', color: 'amber', length: 0 }, null);
    expect(count(text)).toBe(0);
    expect(short).toBeGreaterThan(5);
    expect(long).toBeGreaterThan(short);
    text.dispose();
  });

  it('fades away once the ship stops', () => {
    const trail = new Trail();
    const p = new THREE.Vector3();
    for (let i = 0; i < 10; i++) trail.update(0.15, p.set(i * 0.1, 0, 0), true);
    for (let i = 0; i < 40; i++) trail.update(0.15, p, false);
    const text = new TextLayer();
    text.resize(80, 40);
    trail.draw(text, camera, tan, { glyph: 'stars', color: 'red', length: 2 }, null);
    expect(count(text)).toBe(0);
    text.dispose();
  });
});
