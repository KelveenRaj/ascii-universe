import { sgrAStar } from '@/content/bodies/sgr-a-star';
import type { Body } from '@/content/schema';

/** Every body with an info card. Order is the order lists show them in. */
export const BODIES: readonly Body[] = [sgrAStar];

export const DEFAULT_BODY_ID = sgrAStar.id;

const byId = new Map(BODIES.map((b) => [b.id, b]));

/** Lookup by an untrusted string (URL hash, saved data). */
export function findBody(id: string): Body | undefined {
  return byId.get(id);
}

export function getBody(id: string): Body {
  const body = byId.get(id);
  if (!body) throw new Error(`Unknown body: ${id}`);
  return body;
}

/** Bodies whose parent is `id` (a galaxy's stars, a star's planets). */
export function childrenOf(id: string): Body[] {
  return BODIES.filter((b) => b.parent === id);
}
