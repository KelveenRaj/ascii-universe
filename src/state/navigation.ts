import { createStore } from 'zustand/vanilla';
import { DEFAULT_BODY_ID, findBody, getBody } from '@/content/catalog';
import { getScene } from '@/scenes/registry';
import { worldStore } from '@/state/world';

/**
 * Where you are, in one of two modes. Infographics mode: which body you're looking at, with its
 * info card open (the default) or hidden. Exploration mode (`world`): flying your own ship, where
 * the card follows whatever real body you're in contact with. Mirrored in the URL hash so a link
 * opens the same view:
 *
 *   #/sgr-a-star          infographics: Sagittarius A*, card open
 *   #/sgr-a-star/clear    …card hidden
 *   #/earth?v=30,12,4.5   …seen from a given angle (yaw°, elevation°, distance), from SHARE
 *   #/world               exploration: flying the ship
 *
 * The scene on screen follows from the body (body.sceneId), or in exploration mode from the layer
 * you're flying in. Moving to another scene is done by the Engine, which watches this store and
 * warps whenever the scene has to change. It starts and stops flight the same way.
 */
export interface Route {
  bodyId: string;
  info: boolean;
  /**
   * Flying in the open world. The body is kept, so landing drops you back where you were; no card
   * shows meanwhile.
   */
  world: boolean;
}

export interface NavigationState extends Route {
  setInfo: (open: boolean) => void;
  goTo: (bodyId: string) => void;
  /** Back out to the parent body (Sgr A* → Milky Way). No-op at the top. */
  goUp: () => void;
  /** Launches into the open world, or lands back at the current body. */
  setWorld: (on: boolean) => void;
}

const home = (): Route => ({ bodyId: DEFAULT_BODY_ID, info: true, world: false });

/** The part of a hash before any `?query`, split into path pieces. */
const pathParts = (hash: string): string[] =>
  hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);

/**
 * Hash → route. Anything unknown or malformed lands on the default body, card open. Body ids are
 * URL-safe (tests/content.test.ts), so no decoding is needed.
 */
export function parseHash(hash: string): Route {
  const parts = pathParts(hash);
  if (parts[0] === 'world') return { ...home(), world: true };
  const body = parts[0] ? findBody(parts[0]) : undefined;
  if (!body) return home();
  return { bodyId: body.id, info: parts[1] !== 'clear', world: false };
}

export function formatHash(route: Route): string {
  if (route.world) return '#/world';
  return `#/${route.bodyId}${route.info ? '' : '/clear'}`;
}

/** A camera angle carried by a shared link: yaw and elevation in degrees, and distance. */
export interface ViewParam {
  yaw: number;
  elevation: number;
  distance: number;
}

/** `?v=yaw,elevation,distance` in a hash, or null if absent or malformed. */
export function parseView(hash: string): ViewParam | null {
  const query = hash.split('?')[1];
  const raw = query ? new URLSearchParams(query).get('v') : null;
  if (!raw) return null;
  const nums = raw.split(',').map(Number);
  if (nums.length !== 3 || !nums.every(Number.isFinite) || nums[2] <= 0) return null;
  return { yaw: nums[0], elevation: nums[1], distance: nums[2] };
}

export function formatView(view: ViewParam): string {
  // angles to a tenth of a degree; distance in significant digits (a planet's is a tiny number of au)
  const r = (n: number) => String(Number(n.toFixed(1)));
  return `v=${r(view.yaw)},${r(view.elevation)},${Number(view.distance.toPrecision(4))}`;
}

const initialRoute = (): Route =>
  typeof window === 'undefined' ? home() : parseHash(window.location.hash);

export const navigationStore = createStore<NavigationState>()((set, get) => ({
  ...initialRoute(),
  setInfo: (info) => {
    // in flight the card follows contact; the UI keeps its own dismissal (uiStore.contactHidden)
    if (!get().world) set({ info });
  },
  goTo: (bodyId) => {
    if (findBody(bodyId)) set({ bodyId, world: false });
  },
  goUp: () => {
    if (get().world) return;
    const parent = getBody(get().bodyId).parent;
    if (parent) get().goTo(parent);
  },
  setWorld: (on) => set({ world: on }),
}));

export const activeBody = () => getBody(navigationStore.getState().bodyId);

/** The scene on screen: the open-world layer you're flying in, or the current body's scene. */
export const activeScene = () =>
  navigationStore.getState().world
    ? getScene(worldStore.getState().sceneId)
    : getScene(activeBody().sceneId);

const sameRoute = (a: Route, b: Route) =>
  a.bodyId === b.bodyId && a.info === b.info && a.world === b.world;

/**
 * Keeps the hash and the store in step, both ways. Toggling the card replaces the history entry
 * (Back shouldn't just close a panel); moving to another body or into the open world adds one.
 * Returns an unsubscribe.
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
      write(s, s.bodyId !== prev.bodyId || s.world !== prev.world);
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
