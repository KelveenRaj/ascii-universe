import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_ID } from '@/content/catalog';
import {
  formatHash,
  navigationStore,
  parseHash,
  activeScene,
  type Route,
} from '@/state/navigation';

const at = (bodyId: string, info = false, game: string | null = null): Route => ({
  bodyId,
  info,
  game,
  world: false,
});

describe('hash routes', () => {
  it('parses a body, with and without the info card', () => {
    expect(parseHash('#/sgr-a-star')).toEqual(at('sgr-a-star'));
    expect(parseHash('#/sgr-a-star/info')).toEqual(at('sgr-a-star', true));
    expect(parseHash('#sgr-a-star/info/')).toEqual(at('sgr-a-star', true));
  });

  it('parses a game, only at the body it is played at', () => {
    expect(parseHash('#/sgr-a-star/game/slingshot')).toEqual(at('sgr-a-star', false, 'slingshot'));
    expect(parseHash('#/milky-way/game/slingshot')).toEqual(at('milky-way'));
    expect(parseHash('#/sgr-a-star/game/nope')).toEqual(at('sgr-a-star'));
    expect(parseHash('#/sgr-a-star/game/__proto__')).toEqual(at('sgr-a-star'));
  });

  it('falls back to the default body for anything unknown', () => {
    for (const hash of ['', '#', '#/', '#/nowhere/info', '#/__proto__', '#/%E0%A4%A']) {
      expect(parseHash(hash), hash).toEqual(at(DEFAULT_BODY_ID));
    }
  });

  it('ignores unknown sub-pages', () => {
    expect(parseHash('#/sgr-a-star/edit')).toEqual(at('sgr-a-star'));
  });

  it('round-trips', () => {
    for (const route of [
      at('sgr-a-star'),
      at('sgr-a-star', true),
      at('sgr-a-star', false, 'slingshot'),
    ]) {
      expect(parseHash(formatHash(route))).toEqual(route);
    }
    expect(formatHash(at('sgr-a-star', true))).toBe('#/sgr-a-star/info');
    expect(formatHash(at('sgr-a-star', false, 'slingshot'))).toBe('#/sgr-a-star/game/slingshot');
  });
});

describe('navigation store', () => {
  it('starts at the hub and derives the scene from the body', () => {
    expect(navigationStore.getState().bodyId).toBe('milky-way');
    expect(activeScene().id).toBe('milky-way');
    navigationStore.getState().goTo('sgr-a-star');
    expect(activeScene().id).toBe('black-hole');
  });

  it('goes up to the parent, and nowhere from the top', () => {
    navigationStore.getState().goTo('sgr-a-star');
    navigationStore.getState().goUp();
    expect(navigationStore.getState().bodyId).toBe('milky-way');
    navigationStore.getState().goUp();
    expect(navigationStore.getState().bodyId).toBe('milky-way');
  });

  it('ignores unknown bodies and closes the card when moving', () => {
    const nav = navigationStore.getState();
    nav.setInfo(true);
    nav.goTo('nowhere');
    expect(navigationStore.getState()).toMatchObject({ bodyId: DEFAULT_BODY_ID, info: true });
    nav.goTo(DEFAULT_BODY_ID);
    expect(navigationStore.getState().info).toBe(false);
  });

  it('starts games only where they are played; the card and a game never mix', () => {
    const nav = navigationStore.getState();
    nav.goTo('milky-way');
    nav.setGame('slingshot');
    expect(navigationStore.getState().game).toBe(null);
    nav.goTo('sgr-a-star');
    nav.setInfo(true);
    nav.setGame('slingshot');
    expect(navigationStore.getState()).toMatchObject({ game: 'slingshot', info: false });
    nav.setInfo(true);
    expect(navigationStore.getState()).toMatchObject({ game: null, info: true });
    nav.setGame('slingshot');
    nav.goUp(); // leaving the place ends the game
    expect(navigationStore.getState()).toMatchObject({ bodyId: 'milky-way', game: null });
  });

  it('launches into the open world and lands back at the same body', () => {
    const nav = navigationStore.getState();
    nav.goTo('sgr-a-star');
    nav.setInfo(true);
    nav.setWorld(true);
    expect(navigationStore.getState()).toMatchObject({ world: true, info: false, game: null });
    expect(activeScene().id).toBe('world-galaxy');
    // no cards, games or going up while flying
    nav.setInfo(true);
    nav.setGame('slingshot');
    nav.goUp();
    expect(navigationStore.getState()).toMatchObject({
      bodyId: 'sgr-a-star',
      world: true,
      info: false,
      game: null,
    });
    nav.setWorld(false);
    expect(activeScene().id).toBe('black-hole');
    nav.setWorld(true);
    nav.goTo('milky-way'); // warping somewhere lands you
    expect(navigationStore.getState()).toMatchObject({ bodyId: 'milky-way', world: false });
  });
});

describe('open world route', () => {
  it('parses and formats #/world', () => {
    expect(parseHash('#/world')).toEqual({ ...at(DEFAULT_BODY_ID), world: true });
    expect(parseHash('#/world/anything')).toEqual({ ...at(DEFAULT_BODY_ID), world: true });
    expect(formatHash({ ...at('sgr-a-star'), world: true })).toBe('#/world');
  });
});
