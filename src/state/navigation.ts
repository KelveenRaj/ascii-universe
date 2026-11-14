import { createStore } from 'zustand/vanilla';
import { DEFAULT_BODY_ID, findBody, getBody } from '@/content/catalog';
import { getScene } from '@/scenes/registry';

/**
 * Where you are: which body, and whether its info card is open. Mirrored in the URL hash so a
 * link opens the same view:
 *
 *   #/sgr-a-star        exploring Sagittarius A*
 *   #/sgr-a-star/info   …with its info card open
 *
 * The scene on screen follows from the body (body.sceneId). Switching bodies at runtime (warps)
 * arrives with the hub in M7; for now the engine builds the scene once at start.
 */
export interface Route {
  bodyId: string;
  info: boolean;
}

export interface NavigationState extends Route {
  setInfo: (open: boolean) => void;
  goTo: (bodyId: string) => void;
}

/** Hash → route. Anything unknown or malformed lands on the default body, card closed. Body ids
 * are URL-safe (tests/content.test.ts), so no decoding is needed. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const body = parts[0] ? findBody(parts[0]) : undefined;
  if (!body) return { bodyId: DEFAULT_BODY_ID, info: false };
  return { bodyId: body.id, info: parts[1] === 'info' };
}

export function formatHash(route: Route): string {
  return `#/${route.bodyId}${route.info ? '/info' : ''}`;
}

const initialRoute = (): Route =>
  typeof window === 'undefined'
    ? { bodyId: DEFAULT_BODY_ID, info: false }
    : parseHash(window.location.hash);

export const navigationStore = createStore<NavigationState>()((set) => ({
  ...initialRoute(),
  setInfo: (info) => set({ info }),
  goTo: (bodyId) => {
    if (findBody(bodyId)) set({ bodyId, info: false });
  },
}));

export const activeBody = () => getBody(navigationStore.getState().bodyId);

/** The scene module for the current body. */
export const activeScene = () => getScene(activeBody().sceneId);

/**
 * Keeps the hash and the store in step, both ways. Toggling the card replaces the history entry
 * (Back shouldn't just close a panel); moving to another body adds one. Returns an unsubscribe.
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
    if (s.bodyId !== prev.bodyId || s.info !== prev.info) write(s, s.bodyId !== prev.bodyId);
  });
  const onHashChange = () => {
    const route = parseHash(window.location.hash);
    const s = navigationStore.getState();
    if (route.bodyId !== s.bodyId || route.info !== s.info) navigationStore.setState(route);
    write(route, false); // tidy up a hand-typed hash
  };
  window.addEventListener('hashchange', onHashChange);
  return () => {
    unsubscribe();
    window.removeEventListener('hashchange', onHashChange);
  };
}
