import { describe, expect, it } from 'vitest';
import { LocalProfileRepo, PROFILE_KEY } from '@/profile/LocalProfileRepo';
import { mergeProfiles, migrate, newProfile } from '@/profile/migrate';
import type { ProfileRepo, SaveResult } from '@/profile/ProfileRepo';
import type { PilotProfile } from '@/profile/schema';
import { createProfileStore } from '@/state/profile';

class MemoryStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

const visited = (p: PilotProfile, id: string, first: string): PilotProfile => ({
  ...p,
  discoveries: {
    ...p.discoveries,
    systems: { ...p.discoveries.systems, [id]: { first, visits: 1 } },
  },
});

describe('profile migration', () => {
  it('keeps a valid profile as it is', () => {
    const p = visited(newProfile(), 'g1:1.2.3:0', '2026-11-15T10:00:00.000Z');
    expect(migrate(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('rejects things that are not a profile, or from a newer schema', () => {
    const p = newProfile();
    expect(migrate(null)).toBeNull();
    expect(migrate('hello')).toBeNull();
    expect(migrate({ ...p, playerId: 'me' })).toBeNull();
    expect(migrate({ ...p, schema: 99 })).toBeNull();
  });

  it('repairs malformed fields instead of failing', () => {
    const p = newProfile();
    const out = migrate({
      ...p,
      rev: -4,
      pilot: { callsign: '<script>Ace', claimed: 'yes' },
      ship: { hull: 'mystery' },
      location: { loc: { layer: 'galaxy', pos: [NaN, 0, 0] } },
      discoveries: {
        systems: {
          'g1:0.0.0:1': { first: '2026-11-01T00:00:00Z', visits: 3 },
          'g1:0.0.0:2': { first: 'not a date', visits: 1 },
          'BAD ID': { first: '2026-11-01T00:00:00Z', visits: 1 },
        },
        landmarks: { 'sgr-a-star': '2026-11-02T00:00:00Z', __proto__: 'x' },
      },
      stats: { distanceLy: 'far', jumps: 3.7, playSeconds: -1 },
    })!;
    expect(out.rev).toBe(0);
    expect(out.pilot).toEqual({ callsign: '<SCRIPT>ACE', claimed: null });
    expect(out.ship.hull).toBe('dart');
    expect(out.location).toBeNull();
    expect(Object.keys(out.discoveries.systems)).toEqual(['g1:0.0.0:1']);
    expect(out.discoveries.landmarks).toEqual({ 'sgr-a-star': '2026-11-02T00:00:00Z' });
    expect(out.stats).toEqual({ distanceLy: 0, jumps: 3, playSeconds: 0 });
  });

  it('merges diverged copies without losing discoveries', () => {
    const base = newProfile();
    const theirs = visited({ ...base, rev: 5 }, 'g1:0.0.0:1', '2026-11-03T00:00:00.000Z');
    const mine = visited(
      visited(
        { ...base, stats: { distanceLy: 9, jumps: 1, playSeconds: 2 } },
        'g1:0.0.0:1',
        '2026-11-01T00:00:00.000Z',
      ),
      'g1:0.0.0:2',
      '2026-11-02T00:00:00.000Z',
    );
    const m = mergeProfiles(theirs, mine);
    expect(m.rev).toBe(5);
    expect(m.discoveries.systems['g1:0.0.0:1'].first).toBe('2026-11-01T00:00:00.000Z');
    expect(m.discoveries.systems['g1:0.0.0:2']).toBeDefined();
    expect(m.stats.distanceLy).toBe(9);
  });
});

describe('local profile repo', () => {
  it('saves with revisions and refuses a stale save', async () => {
    const storage = new MemoryStorage();
    const repo = new LocalProfileRepo(storage);
    expect(await repo.load()).toBeNull();

    const p = newProfile();
    expect(await repo.save(p, 0)).toEqual({ ok: true, rev: 1 });
    expect((await repo.load())?.rev).toBe(1);

    const stale = await repo.save(p, 0); // another tab still thinks it's at rev 0
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.conflict.rev).toBe(1);
  });

  it('survives broken or missing storage', async () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, '{not json');
    expect(await new LocalProfileRepo(storage).load()).toBeNull();
    const none = new LocalProfileRepo(null);
    expect(await none.load()).toBeNull();
    expect((await none.save(newProfile(), 0)).ok).toBe(true);
  });
});

describe('profile store', () => {
  it('creates and saves a guest pilot on first load, then reuses it', async () => {
    const storage = new MemoryStorage();
    const first = createProfileStore(new LocalProfileRepo(storage), 0);
    const p = await first.getState().load();
    expect(p.rev).toBe(1);
    const again = createProfileStore(new LocalProfileRepo(storage), 0);
    expect((await again.getState().load()).playerId).toBe(p.playerId);
  });

  it('merges and retries when another tab saved in between', async () => {
    const storage = new MemoryStorage();
    const tabA = createProfileStore(new LocalProfileRepo(storage), 60_000);
    await tabA.getState().load();
    const tabB = createProfileStore(new LocalProfileRepo(storage), 60_000);
    await tabB.getState().load();

    tabB.getState().update((p) => visited(p, 'g1:0.0.0:2', '2026-11-02T00:00:00.000Z'));
    await tabB.getState().flush();
    tabA.getState().update((p) => visited(p, 'g1:0.0.0:1', '2026-11-01T00:00:00.000Z'));
    await tabA.getState().flush();

    const stored = (await new LocalProfileRepo(storage).load())!;
    expect(Object.keys(stored.discoveries.systems).sort()).toEqual(['g1:0.0.0:1', 'g1:0.0.0:2']);
    expect(stored.rev).toBe(3);
    expect(tabA.getState().profile?.rev).toBe(3);
  });

  it('keeps playing when saving fails', async () => {
    const failing: ProfileRepo = {
      load: () => Promise.reject(new Error('offline')),
      save: (): Promise<SaveResult> => Promise.reject(new Error('offline')),
    };
    const store = createProfileStore(failing, 0);
    const p = await store.getState().load();
    expect(p.rev).toBe(0);
    store.getState().update((q) => ({ ...q, pilot: { ...q.pilot, callsign: 'ACE' } }));
    await store.getState().flush();
    expect(store.getState().profile?.pilot.callsign).toBe('ACE');
  });
});
