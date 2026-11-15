import { createStore } from 'zustand/vanilla';
import { DEFAULT_BODY_ID, findBody, getBody } from '@/content/catalog';
import { findGame } from '@/games/registry';
import { getScene } from '@/scenes/registry';
import { worldStore } from '@/state/world';

/**
 * Where you are: which body, whether its info card is open, which minigame (if any) you're
 * playing there, and whether you're out flying in the open world. Mirrored in the URL hash so a
 * link opens the same view:
 *
 *   #/sgr-a-star                  exploring Sagittarius A*
 *   #/sgr-a-star/info             …with its info card open
 *   #/sgr-a-star/game/slingshot   …playing Slingshot
 *   #/world                       free-roaming the open world in your ship
 *
 * The scene on screen follows from the body (body.sceneId), or in the open world from the layer
 * you're flying in. Moving to another scene is done by the Engine, which watches this store and
 * warps whenever the scene has to change. It starts and stops games and flight the same way.
 */
export interface Route {
  bodyId: string;
  info: boolean;
  /** Id of the minigame being played here, or null. The card and a game never show together. */
  game: string | null;
  /**
   * Flying in the open world. The body is kept, so landing drops you back where you were; no card
   * or game shows meanwhile.
   */
  world: boolean;
}

export interface NavigationState extends Route {
  setInfo: (open: boolean) => void;
  /** Starts a game played at the current body (others are ignored), or quits with null. */
  setGame: (gameId: string | null) => void;
  goTo: (bodyId: string) => void;
  /** Back out to the parent body (Sgr A* → Milky Way). No-op at the top. */
  goUp: () => void;
  /** Launches into the open world, or lands back at the current body. */
  setWorld: (on: boolean) => void;
}

const home = (): Route => ({ bodyId: DEFAULT_BODY_ID, info: false, game: null, world: false });

/**
 * Hash → route. Anything unknown or malformed lands on the default body, card closed. Body and
 * game ids are URL-safe (tests/content.test.ts), so no decoding is needed.
 */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'world') return { ...home(), world: true };
  const body = parts[0] ? findBody(parts[0]) : undefined;
  if (!body) return home();
  const game = parts[1] === 'game' && parts[2] ? findGame(parts[2]) : undefined;
  if (game && game.bodyId === body.id) {
    return { bodyId: body.id, info: false, game: game.id, world: false };
  }
  return { bodyId: body.id, info: parts[1] === 'info', game: null, world: false };
}

export function formatHash(route: Route): string {
  if (route.world) return '#/world';
  if (route.game) return `#/${route.bodyId}/game/${route.game}`;
  return `#/${route.bodyId}${route.info ? '/info' : ''}`;
}

const initialRoute = (): Route =>
  typeof window === 'undefined' ? home() : parseHash(window.location.hash);

export const navigationStore = createStore<NavigationState>()((set, get) => ({
  ...initialRoute(),
  setInfo: (info) => {
    if (!get().world) set(info ? { info, game: null } : { info });
  },
  setGame: (gameId) => {
    if (gameId === null) set({ game: null });
    else if (!get().world && findGame(gameId)?.bodyId === get().bodyId) {
      set({ game: gameId, info: false });
    }
  },
  goTo: (bodyId) => {
    if (findBody(bodyId)) set({ bodyId, info: false, game: null, world: false });
  },
  goUp: () => {
    if (get().world) return;
    const parent = getBody(get().bodyId).parent;
    if (parent) get().goTo(parent);
  },
  setWorld: (on) => set(on ? { world: true, info: false, game: null } : { world: false }),
}));

export const activeBody = () => getBody(navigationStore.getState().bodyId);

/** The scene on screen: the open-world layer you're flying in, or the current body's scene. */
export const activeScene = () =>
  navigationStore.getState().world
    ? getScene(worldStore.getState().sceneId)
    : getScene(activeBody().sceneId);

const sameRoute = (a: Route, b: Route) =>
  a.bodyId === b.bodyId && a.info === b.info && a.game === b.game && a.world === b.world;

/**
 * Keeps the hash and the store in step, both ways. Toggling the card replaces the history entry
 * (Back shouldn't just close a panel); moving to another body, into a game or into the open world
 * adds one. Returns an unsubscribe.
 */
export function startHashSync(): () => void {
  const write = (route: Route, push: boolean) => {
    const hash = formatHash(route);
    if (window.location.hash === hash) return;
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  };

  write(navigationStore.getState(), false); // canonicalise whatever we were opened with
  const unsubscribe = navigationStore.subscribe((s, prev) => {
    if (!sameRoute(s, prev)) {
      write(s, s.bodyId !== prev.bodyId || s.game !== prev.game || s.world !== prev.world);
    }
  });
  const onHashChange = () => {
    const parsed = parseHash(window.location.hash);
    const now = navigationStore.getState();
    // #/world carries no body: keep the one you launched from, so landing goes back there
    const route = parsed.world ? { ...parsed, bodyId: now.bodyId } : parsed;
    if (!sameRoute(route, now)) navigationStore.setState(route);
    write(route, false); // tidy up a hand-typed hash
  };
  window.addEventListener('hashchange', onHashChange);
  return () => {
    unsubscribe();
    window.removeEventListener('hashchange', onHashChange);
  };
}
