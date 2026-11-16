import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { textColors } from '@/engine/display/DisplayPipeline';
import { hexToRgb, luminance, sampleRamp } from '@/engine/display/palette/lut';
import { PALETTES } from '@/engine/display/palette/palettes';
import { TEXT_STYLES, TEXT_SWATCHES, TextLayer } from '@/engine/display/TextLayer';
import { MILKY_WAY_MATERIALS } from '@/scenes/milky-way/materials';
import { blackHoleScene } from '@/scenes/black-hole';
import { worldGalaxyScene } from '@/scenes/world-galaxy';
import { worldSystemScene } from '@/scenes/world-system';
import {
  glowRamp,
  hullRamp,
  SHIP_GLOW,
  SHIP_HULL,
  SHIP_MATERIALS,
  SHIP_TRIM,
} from '@/world/ship/colors';
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
import {
  ENGINE_LABELS,
  exhaustGeometry,
  HULL_LABELS,
  PART_GLOW,
  PART_HULL,
  PART_TRIM,
  shipModel,
  WING_LABELS,
} from '@/world/ship/model';
import { Trail } from '@/world/ship/sprite';

const ALL = HULLS.flatMap((hull) =>
  WINGS.flatMap((wings) => ENGINES.map((engine) => ({ hull, wings, engine }))),
);

describe('ship mesh', () => {
  it('builds every combination: about one unit long, bounded, nose at -Z, all three parts', () => {
    for (const design of ALL) {
      const label = JSON.stringify(design);
      const { geometry, nozzles } = shipModel(design);
      const box = geometry.boundingBox!;
      expect(box.max.z - box.min.z, label).toBeCloseTo(1, 5);
      expect(Math.max(-box.min.x, box.max.x), label).toBeLessThan(0.8);
      expect(Math.max(-box.min.y, box.max.y), label).toBeLessThan(0.5);
      const pos = geometry.getAttribute('position');
      // the front is the nose, on the centre line (a point, or a blunt face centred on it)
      let zMin = Infinity;
      for (let i = 0; i < pos.count; i++) zMin = Math.min(zMin, pos.getZ(i));
      expect(zMin, label).toBeCloseTo(-0.5, 5);
      const front = [...Array(pos.count).keys()].filter((i) => pos.getZ(i) < zMin + 1e-4);
      const meanX = front.reduce((sum, i) => sum + pos.getX(i), 0) / front.length;
      expect(Math.abs(meanX), label).toBeLessThan(0.02);
      // hull, trim, glow, in that order, covering every vertex
      expect(geometry.groups.map((g) => g.materialIndex)).toEqual([
        PART_HULL,
        PART_TRIM,
        PART_GLOW,
      ]);
      for (const g of geometry.groups) expect(g.count, label).toBeGreaterThan(0);
      expect(geometry.groups.reduce((n, g) => n + g.count, 0)).toBe(pos.count);
      expect(pos.count / 3, label).toBeLessThan(2000);
      expect(geometry.getAttribute('normal').count).toBe(pos.count);
      expect(geometry.getAttribute('aPart').count).toBe(pos.count);
      // the engine's nozzles are at the back, where the exhaust comes out
      expect(nozzles.length).toBeGreaterThan(0);
      for (const n of nozzles) expect(n.pos[2], label).toBeGreaterThan(0);
    }
  });

  it('has outward-facing normals: on the top surface they point up', () => {
    const { geometry } = shipModel(DEFAULT_SHIP);
    const pos = geometry.getAttribute('position');
    const nrm = geometry.getAttribute('normal');
    let top = 0;
    for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(top)) top = i;
    expect(nrm.getY(top)).toBeGreaterThan(0);
  });

  it('caches meshes by parts only, not by colour or name', () => {
    const red: ShipDesign = { ...DEFAULT_SHIP, color: 'red', name: 'OTHER' };
    expect(shipModel(DEFAULT_SHIP)).toBe(shipModel(red));
    expect(shipModel(DEFAULT_SHIP)).not.toBe(shipModel({ ...DEFAULT_SHIP, hull: 'saucer' }));
    expect(exhaustGeometry(shipModel(DEFAULT_SHIP))).toBe(exhaustGeometry(shipModel(red)));
  });

  it('labels every part for the hangar', () => {
    for (const h of HULLS) expect(HULL_LABELS[h]).toBe(h.toUpperCase());
    for (const w of WINGS) expect(WING_LABELS[w]).toBe(w.toUpperCase());
    for (const e of ENGINES) expect(ENGINE_LABELS[e]).toBe(e.toUpperCase());
  });
});

describe('ship palette rows', () => {
  it('builds the hull ramp from the swatch: black, the swatch in light, a pale highlight', () => {
    for (const s of TEXT_SWATCHES) {
      const ramp = hullRamp(s.id);
      expect(ramp.stops[0]).toEqual([0, '#000000']);
      expect(ramp.stops.map(([, hex]) => hex.toUpperCase())).toContain(s.hex.toUpperCase());
      const lums = ramp.stops.map(([, hex]) => luminance(hexToRgb(hex)));
      for (let i = 1; i < lums.length; i++) expect(lums[i]).toBeGreaterThanOrEqual(lums[i - 1]);
      const lit = sampleRamp(ramp, 0.75);
      hexToRgb(s.hex).forEach((c, k) => expect(lit[k]).toBeCloseTo(c, 6));
    }
    expect(glowRamp('cyan').stops.at(-1)).toEqual([1, '#FFFFFF']);
  });

  it('is in every open-world scene, after its own materials, hull first', () => {
    for (const scene of [worldGalaxyScene, worldSystemScene, blackHoleScene]) {
      const ids = scene.materials.map((m) => m.id);
      expect(ids.slice(-3)).toEqual([SHIP_HULL, SHIP_TRIM, SHIP_GLOW]);
    }
    expect(SHIP_MATERIALS[0].ramp).toEqual(hullRamp(DEFAULT_SHIP.color));
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
