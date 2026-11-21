import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_ID } from '@/content/catalog';
import {
  formatHash,
  navigationStore,
  parseHash,
  activeScene,
  type Route,
} from '@/state/navigation';

/** Infographics mode: the card is open unless the route says `clear`. */
const at = (bodyId: string, info = true): Route => ({ bodyId, info, game: null, world: false });

describe('hash routes', () => {
  it('parses a body, card open by default and hidden with /clear', () => {
    expect(parseHash('#/sgr-a-star')).toEqual(at('sgr-a-star'));
    expect(parseHash('#/sgr-a-star/clear')).toEqual(at('sgr-a-star', false));
    expect(parseHash('#sgr-a-star/clear/')).toEqual(at('sgr-a-star', false));
    expect(parseHash('#/sgr-a-star/info')).toEqual(at('sgr-a-star')); // the old link still works
  });

  it('only knows the three places and their bodies', () => {
    expect(parseHash('#/solar-system')).toEqual(at('solar-system'));
    expect(parseHash('#/earth')).toEqual(at('earth'));
    expect(parseHash('#/sgr-a-star/game/slingshot')).toEqual(at('sgr-a-star')); // archived
  });

  it('falls back to the default body for anything unknown', () => {
    for (const hash of ['', '#', '#/', '#/nowhere/info', '#/__proto__', '#/%E0%A4%A']) {
      expect(parseHash(hash), hash).toEqual(at(DEFAULT_BODY_ID));
    }
  });

  it('round-trips', () => {
    for (const route of [at('sgr-a-star'), at('sgr-a-star', false), at('milky-way')]) {
      expect(parseHash(formatHash(route))).toEqual(route);
    }
    expect(formatHash(at('sgr-a-star'))).toBe('#/sgr-a-star');
    expect(formatHash(at('sgr-a-star', false))).toBe('#/sgr-a-star/clear');
  });
});

describe('navigation store', () => {
  it('starts at the Milky Way with its card open, and derives the scene from the body', () => {
    expect(navigationStore.getState()).toMatchObject({ bodyId: 'milky-way', info: true });
    expect(activeScene().id).toBe('milky-way');
    navigationStore.getState().goTo('sgr-a-star');
    expect(activeScene().id).toBe('black-hole');
    navigationStore.getState().goTo('milky-way');
  });

  it('goes up to the parent, and nowhere from the top', () => {
    navigationStore.getState().goTo('sgr-a-star');
    navigationStore.getState().goUp();
    expect(navigationStore.getState().bodyId).toBe('milky-way');
    navigationStore.getState().goUp();
    expect(navigationStore.getState().bodyId).toBe('milky-way');
  });

  it('ignores unknown bodies, and keeps the card as you left it when moving', () => {
    const nav = navigationStore.getState();
    nav.setInfo(false);
    nav.goTo('nowhere');
    expect(navigationStore.getState()).toMatchObject({ bodyId: DEFAULT_BODY_ID, info: false });
    nav.goTo('sgr-a-star');
    expect(navigationStore.getState()).toMatchObject({ bodyId: 'sgr-a-star', info: false });
    nav.setInfo(true);
    nav.goTo(DEFAULT_BODY_ID);
    expect(navigationStore.getState().info).toBe(true);
  });

  it('has no minigames', () => {
    const nav = navigationStore.getState();
    nav.goTo('sgr-a-star');
    nav.setGame('slingshot');
    expect(navigationStore.getState().game).toBe(null);
    nav.goTo('milky-way');
  });

  it('launches into exploration and lands back at the same body', () => {
    const nav = navigationStore.getState();
    nav.goTo('sgr-a-star');
    nav.setInfo(true);
    nav.setWorld(true);
    expect(navigationStore.getState()).toMatchObject({ world: true, game: null });
    expect(activeScene().id).toBe('world-galaxy');
    // no going up while flying (the card follows contact, see uiStore.contactHidden)
    nav.goUp();
    expect(navigationStore.getState()).toMatchObject({ bodyId: 'sgr-a-star', world: true });
    nav.setWorld(false);
    expect(activeScene().id).toBe('black-hole');
    nav.setWorld(true);
    nav.goTo('milky-way'); // warping somewhere lands you
    expect(navigationStore.getState()).toMatchObject({ bodyId: 'milky-way', world: false });
  });
});

describe('exploration route', () => {
  it('parses and formats #/world', () => {
    expect(parseHash('#/world')).toEqual({ ...at(DEFAULT_BODY_ID), world: true });
    expect(parseHash('#/world/anything')).toEqual({ ...at(DEFAULT_BODY_ID), world: true });
    expect(formatHash({ ...at('sgr-a-star'), world: true })).toBe('#/world');
  });
});
