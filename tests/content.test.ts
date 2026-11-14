import { describe, expect, it } from 'vitest';
import { BODIES, DEFAULT_BODY_ID, childrenOf, findBody, getBody } from '@/content/catalog';
import { findScene } from '@/scenes/registry';

describe('content catalog', () => {
  it('has unique body ids that are safe in a URL', () => {
    const ids = BODIES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(findBody(DEFAULT_BODY_ID)).toBeDefined();
  });

  it('looks bodies up safely', () => {
    expect(getBody('sgr-a-star').name).toBe('Sagittarius A*');
    expect(findBody('nope')).toBeUndefined();
    expect(findBody('constructor')).toBeUndefined();
    expect(() => getBody('nope')).toThrow();
  });

  for (const body of BODIES) {
    describe(body.id, () => {
      it('renders with a registered scene and has a known parent', () => {
        expect(findScene(body.sceneId)).toBeDefined();
        if (body.parent) expect(findBody(body.parent)).toBeDefined();
        if (body.parent) expect(childrenOf(body.parent)).toContain(body);
      });

      it('has text to show', () => {
        expect(body.tagline.trim()).not.toBe('');
        expect(body.summary.length).toBeGreaterThan(0);
        expect(body.facts.length).toBeGreaterThan(0);
      });

      it('cites a source for every fact, and every source is used', () => {
        const ids = body.sources.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const f of body.facts) expect(ids, `${f.label} → ${f.source}`).toContain(f.source);
        for (const id of ids)
          expect(
            body.facts.some((f) => f.source === id),
            id,
          ).toBe(true);
      });

      it('has unique fact labels', () => {
        const labels = body.facts.map((f) => f.label);
        expect(new Set(labels).size).toBe(labels.length);
      });

      it('links sources over https with a plausible year', () => {
        for (const s of body.sources) {
          expect(new URL(s.url).protocol, s.id).toBe('https:');
          expect(s.year).toBeGreaterThan(1900);
          expect(s.year).toBeLessThanOrEqual(new Date().getFullYear());
          expect(s.title.trim()).not.toBe('');
          expect(s.publisher.trim()).not.toBe('');
        }
      });
    });
  }
});

describe('Sagittarius A*', () => {
  it('horizon radius matches 2GM/c² for the quoted mass', () => {
    const body = getBody('sgr-a-star');
    const mass = parseFloat(body.facts.find((f) => f.label === 'MASS')!.value) * 1e6;
    const horizonKm = parseFloat(body.facts.find((f) => f.label === 'HORIZON')!.value) * 1e6;
    const SUN_SCHWARZSCHILD_KM = 2.95325; // 2GM☉/c²
    expect(horizonKm).toBeCloseTo(mass * SUN_SCHWARZSCHILD_KM, -5); // within 0.1 million km
  });
});
