import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_ID } from '@/content/catalog';
import { formatHash, navigationStore, parseHash, activeScene } from '@/state/navigation';

describe('hash routes', () => {
  it('parses a body, with and without the info card', () => {
    expect(parseHash('#/sgr-a-star')).toEqual({ bodyId: 'sgr-a-star', info: false });
    expect(parseHash('#/sgr-a-star/info')).toEqual({ bodyId: 'sgr-a-star', info: true });
    expect(parseHash('#sgr-a-star/info/')).toEqual({ bodyId: 'sgr-a-star', info: true });
  });

  it('falls back to the default body for anything unknown', () => {
    const home = { bodyId: DEFAULT_BODY_ID, info: false };
    for (const hash of ['', '#', '#/', '#/nowhere/info', '#/__proto__', '#/%E0%A4%A']) {
      expect(parseHash(hash), hash).toEqual(home);
    }
  });

  it('ignores unknown sub-pages', () => {
    expect(parseHash('#/sgr-a-star/edit')).toEqual({ bodyId: 'sgr-a-star', info: false });
  });

  it('round-trips', () => {
    for (const route of [
      { bodyId: 'sgr-a-star', info: false },
      { bodyId: 'sgr-a-star', info: true },
    ]) {
      expect(parseHash(formatHash(route))).toEqual(route);
    }
    expect(formatHash({ bodyId: 'sgr-a-star', info: true })).toBe('#/sgr-a-star/info');
  });
});

describe('navigation store', () => {
  it('derives the scene from the body', () => {
    expect(activeScene().id).toBe('black-hole');
  });

  it('ignores unknown bodies and closes the card when moving', () => {
    const nav = navigationStore.getState();
    nav.setInfo(true);
    nav.goTo('nowhere');
    expect(navigationStore.getState()).toMatchObject({ bodyId: DEFAULT_BODY_ID, info: true });
    nav.goTo(DEFAULT_BODY_ID);
    expect(navigationStore.getState().info).toBe(false);
  });
});
