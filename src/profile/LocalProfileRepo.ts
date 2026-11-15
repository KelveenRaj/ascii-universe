import { migrate } from '@/profile/migrate';
import type { ProfileRepo, SaveResult } from '@/profile/ProfileRepo';
import type { PilotProfile } from '@/profile/schema';

export const PROFILE_KEY = 'ascii-universe:pilot';

/**
 * Keeps the profile in localStorage under one key. Revisions work like a server would check them,
 * so two open tabs can't silently overwrite each other's progress: a save based on a stale rev is
 * refused with the stored copy, and the caller merges.
 *
 * Storage can be missing or throw (private windows, blocked site data). Then loads come back empty
 * and saves pretend to succeed: the game still plays, it just won't remember.
 */
export class LocalProfileRepo implements ProfileRepo {
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;

  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.storage = storage !== undefined ? storage : LocalProfileRepo.browserStorage();
  }

  private static browserStorage(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  }

  private read(): PilotProfile | null {
    try {
      const raw = this.storage?.getItem(PROFILE_KEY);
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  load(): Promise<PilotProfile | null> {
    return Promise.resolve(this.read());
  }

  save(profile: PilotProfile, baseRev: number): Promise<SaveResult> {
    const stored = this.read();
    if (stored && stored.playerId === profile.playerId && stored.rev !== baseRev) {
      return Promise.resolve({ ok: false, conflict: stored });
    }
    const rev = baseRev + 1;
    try {
      this.storage?.setItem(PROFILE_KEY, JSON.stringify({ ...profile, rev }));
    } catch {
      // full or blocked storage: keep playing without saving
    }
    return Promise.resolve({ ok: true, rev });
  }
}
