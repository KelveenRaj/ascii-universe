import { describe, expect, it } from 'vitest';
import {
  anyCrtEffect,
  crtStrengths,
  DEFAULT_SETTINGS,
  NUMERIC_RANGES,
  sanitizeSettings,
  stepsFor,
} from '@/state/settings';

describe('settings validation', () => {
  it('ignores garbage', () => {
    expect(sanitizeSettings(null)).toEqual({});
    expect(sanitizeSettings('nope')).toEqual({});
    expect(sanitizeSettings(42)).toEqual({});
  });

  it('keeps valid values', () => {
    const saved = { palette: 'green', ramp: 'blocks', exposure: 3, crt: false, supersample: 1 };
    expect(sanitizeSettings(saved)).toEqual(saved);
  });

  it('drops unknown keys, wrong types and invalid enum values', () => {
    const out = sanitizeSettings({
      palette: 'rainbow',
      ramp: 7,
      quality: 'insane',
      supersample: 3,
      crt: 'yes',
      exposure: '2',
      somethingElse: true,
    });
    expect(out).toEqual({});
  });

  it('clamps numbers to their range and rejects NaN / Infinity', () => {
    const out = sanitizeSettings({
      exposure: 999,
      bloomStrength: -5,
      curvatureAmount: NaN,
      vignetteStrength: Infinity,
    });
    expect(out.exposure).toBe(NUMERIC_RANGES.exposure.max);
    expect(out.bloomStrength).toBe(NUMERIC_RANGES.bloomStrength.min);
    expect('curvatureAmount' in out).toBe(false);
    expect('vignetteStrength' in out).toBe(false);
  });

  it('drops the v1 black-hole keys (they moved to scene params)', () => {
    const out = sanitizeSettings({ diskSpeed: 2, beaming: 1, starDensity: 0.5, exposure: 3 });
    expect(out).toEqual({ exposure: 3 });
  });

  it('never restores session-only state', () => {
    expect(sanitizeSettings({ debugView: 'steps', paused: true })).toEqual({});
  });

  it('defaults are all valid', () => {
    const { debugView, paused, ...persisted } = DEFAULT_SETTINGS;
    expect([debugView, paused]).toEqual(['final', false]);
    expect(sanitizeSettings(persisted)).toEqual(persisted);
  });
});

describe('derived settings', () => {
  it('maps quality to a step budget', () => {
    expect(stepsFor('low')).toBeLessThan(stepsFor('high'));
    expect(stepsFor('ultra')).toBeGreaterThan(stepsFor('high'));
    expect(stepsFor('auto')).toBe(stepsFor('high'));
  });

  it('CRT strengths honour the master switch and each toggle', () => {
    const fx = crtStrengths(DEFAULT_SETTINGS);
    expect(fx.curvature).toBe(DEFAULT_SETTINGS.curvatureAmount);
    expect(fx.mask).toBe(0); // phosphor mask is off by default
    expect(anyCrtEffect(crtStrengths({ ...DEFAULT_SETTINGS, crt: false }))).toBe(false);
  });
});
