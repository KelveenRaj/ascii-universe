import { describe, expect, it } from 'vitest';
import {
  defaultParams,
  sanitizeParam,
  sanitizeParams,
  type ParamSchema,
} from '@/engine/scene/params';
import { SCENES } from '@/scenes/registry';
import { migrateLegacySceneParams, SCENE_PARAMS_KEY, SETTINGS_KEY } from '@/state/legacySettings';
import { defaultSceneParams, sanitizeSceneParams, sceneParamsStore } from '@/state/sceneParams';

const SCHEMA = {
  speed: { kind: 'number', label: 'SPEED', default: 2, min: 0, max: 10, step: 0.5 },
  grid: { kind: 'boolean', label: 'GRID', default: false },
} satisfies ParamSchema;

describe('param schema helpers', () => {
  it('builds defaults', () => {
    expect(defaultParams(SCHEMA)).toEqual({ speed: 2, grid: false });
  });

  it('clamps numbers and rejects wrong types, NaN and Infinity', () => {
    expect(sanitizeParam(SCHEMA.speed, 99)).toBe(10);
    expect(sanitizeParam(SCHEMA.speed, -1)).toBe(0);
    expect(sanitizeParam(SCHEMA.speed, NaN)).toBeUndefined();
    expect(sanitizeParam(SCHEMA.speed, Infinity)).toBeUndefined();
    expect(sanitizeParam(SCHEMA.speed, '3')).toBeUndefined();
    expect(sanitizeParam(SCHEMA.grid, true)).toBe(true);
    expect(sanitizeParam(SCHEMA.grid, 1)).toBeUndefined();
  });

  it('accepts only listed choices', () => {
    const flow = {
      kind: 'choice',
      label: 'FLOW',
      default: 'a',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    } as const;
    expect(sanitizeParam(flow, 'b')).toBe('b');
    expect(sanitizeParam(flow, 'c')).toBeUndefined();
    expect(sanitizeParam(flow, 1)).toBeUndefined();
  });

  it('fills a full value object from garbage, keeping what validates', () => {
    expect(sanitizeParams(SCHEMA, null)).toEqual({ speed: 2, grid: false });
    expect(sanitizeParams(SCHEMA, { speed: 4, grid: 'yes', other: 1 })).toEqual({
      speed: 4,
      grid: false,
    });
  });
});

describe('every scene schema', () => {
  for (const scene of Object.values(SCENES)) {
    it(`${scene.id}: defaults are in range and labels are set`, () => {
      for (const [name, param] of Object.entries(scene.params)) {
        expect(param.label.length, name).toBeGreaterThan(0);
        expect(sanitizeParam(param, param.default), name).toBe(param.default);
        if (param.kind === 'number') expect(param.max, name).toBeGreaterThan(param.min);
      }
    });
  }
});

describe('scene params store', () => {
  it('has full defaults for every scene, and drops unknown scenes', () => {
    const out = sanitizeSceneParams({ 'no-such-scene': { x: 1 } });
    expect(out).toEqual(defaultSceneParams());
  });

  it('validates writes and resets', () => {
    const store = sceneParamsStore.getState();
    store.set('black-hole', 'diskSpeed', 999);
    expect(sceneParamsStore.getState().values['black-hole'].diskSpeed).toBe(30);
    store.set('black-hole', 'notAParam', 1);
    expect('notAParam' in sceneParamsStore.getState().values['black-hole']).toBe(false);
    store.resetScene('black-hole');
    expect(sceneParamsStore.getState().values['black-hole'].diskSpeed).toBe(6);
  });
});

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const v1Settings = (state: Record<string, unknown>) => JSON.stringify({ state, version: 1 });

describe('v1 → scene params migration', () => {
  it('copies the black-hole keys out of saved v1 settings', () => {
    const store = new MemoryStorage();
    store.setItem(
      SETTINGS_KEY,
      v1Settings({ palette: 'green', diskSpeed: 12, beaming: 1.5, starDensity: 0.8 }),
    );
    migrateLegacySceneParams(store);
    const saved = JSON.parse(store.getItem(SCENE_PARAMS_KEY)!);
    expect(saved.state.values['black-hole']).toEqual({
      diskSpeed: 12,
      beaming: 1.5,
      starDensity: 0.8,
    });
    // and the store would load them as valid values
    expect(sanitizeSceneParams(saved.state.values)['black-hole']).toMatchObject({
      diskSpeed: 12,
      beaming: 1.5,
      starDensity: 0.8,
      diskInner: 3,
    });
  });

  it('never overwrites existing scene params', () => {
    const store = new MemoryStorage();
    store.setItem(SETTINGS_KEY, v1Settings({ diskSpeed: 12 }));
    store.setItem(SCENE_PARAMS_KEY, 'keep me');
    migrateLegacySceneParams(store);
    expect(store.getItem(SCENE_PARAMS_KEY)).toBe('keep me');
  });

  it('does nothing without old settings, or with nothing to move, or with junk', () => {
    for (const old of [null, v1Settings({ palette: 'green' }), '{not json', 'null']) {
      const store = new MemoryStorage();
      if (old !== null) store.setItem(SETTINGS_KEY, old);
      migrateLegacySceneParams(store);
      expect(store.getItem(SCENE_PARAMS_KEY)).toBeNull();
    }
  });
});
