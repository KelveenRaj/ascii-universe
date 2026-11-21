import { describe, expect, it } from 'vitest';
import { findBody } from '@/content/catalog';
import { TOURS } from '@/content/tours';
import { navigationStore } from '@/state/navigation';
import { tourStore } from '@/state/tour';

describe('tours', () => {
  it('have unique ids and a few steps each', () => {
    expect(new Set(TOURS.map((t) => t.id)).size).toBe(TOURS.length);
    for (const t of TOURS) expect(t.steps.length).toBeGreaterThan(1);
  });

  for (const tour of TOURS) {
    it(`${tour.id}: every step shows real, cited facts of a real body`, () => {
      for (const step of tour.steps) {
        const body = findBody(step.bodyId);
        expect(body, step.bodyId).toBeDefined();
        expect(step.prompt.trim()).not.toBe('');
        expect(step.facts.length).toBeGreaterThan(0);
        for (const label of step.facts) {
          const fact = body!.facts.find((f) => f.label === label);
          expect(fact, `${step.bodyId} → ${label}`).toBeDefined();
          expect(body!.sources.some((s) => s.id === fact!.source)).toBe(true);
        }
      }
    });
  }
});

describe('tour state', () => {
  it('walks the steps, moving the view, and ends after the last', () => {
    const tour = tourStore.getState();
    const nav = navigationStore.getState();
    nav.setWorld(false);
    tour.start('solar-walk');
    expect(navigationStore.getState().bodyId).toBe('sun');
    tourStore.getState().next();
    expect(navigationStore.getState().bodyId).toBe('mercury');
    tourStore.getState().prev();
    expect(navigationStore.getState().bodyId).toBe('sun');
    tourStore.getState().prev(); // nothing before the first step
    expect(tourStore.getState().step).toBe(0);
    for (let i = 0; i < 10; i++) tourStore.getState().next();
    expect(tourStore.getState().tourId).toBeNull();
    nav.goTo('milky-way');
  });

  it('ends when you take off', () => {
    tourStore.getState().start('where-are-we');
    navigationStore.getState().setWorld(true);
    expect(tourStore.getState().tourId).toBeNull();
    navigationStore.getState().setWorld(false);
  });

  it('ignores unknown tours', () => {
    tourStore.getState().start('nope');
    expect(tourStore.getState().tourId).toBeNull();
  });
});
