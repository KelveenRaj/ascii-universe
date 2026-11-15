import { createStore, type StoreApi } from 'zustand/vanilla';
import { LocalProfileRepo } from '@/profile/LocalProfileRepo';
import { mergeProfiles, newProfile } from '@/profile/migrate';
import type { ProfileRepo } from '@/profile/ProfileRepo';
import type { PilotProfile } from '@/profile/schema';

/** How long after the last change a save goes out. Also flushed when the tab is hidden. */
export const SAVE_DELAY_MS = 5000;

export interface ProfileState {
  /** Null until the first load finishes. */
  profile: PilotProfile | null;
  /** Loads the stored pilot, or creates a guest one (and saves it). Safe to call more than once. */
  load: () => Promise<PilotProfile>;
  /** Applies a change and schedules a save. Ignored before load. */
  update: (change: (p: PilotProfile) => PilotProfile) => void;
  /** Saves now if there's anything unsaved. */
  flush: () => Promise<void>;
}

/**
 * The pilot profile, loaded and saved through a ProfileRepo (not zustand `persist`), so moving
 * saves from the browser to a server later only swaps the repo. Saves are debounced and one at a
 * time; a save refused as stale is merged with the stored copy (mergeProfiles) and retried.
 */
export function createProfileStore(
  repo: ProfileRepo,
  saveDelayMs = SAVE_DELAY_MS,
): StoreApi<ProfileState> {
  let loading: Promise<PilotProfile> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let saving: Promise<void> = Promise.resolve();

  const store = createStore<ProfileState>()((set, get) => {
    /** One save of whatever is current; retries once after merging on a conflict. */
    const saveOnce = async (): Promise<void> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const current = get().profile;
        if (!current || !dirty) return;
        dirty = false;
        let result;
        try {
          result = await repo.save(current, current.rev);
        } catch {
          dirty = true; // offline or broken storage: keep it for the next save
          return;
        }
        if (result.ok) {
          const latest = get().profile;
          if (latest) set({ profile: { ...latest, rev: result.rev } });
          return;
        }
        const latest = get().profile ?? current;
        set({ profile: mergeProfiles(result.conflict, latest) });
        dirty = true;
      }
    };

    const flush = (): Promise<void> => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      saving = saving.then(saveOnce, saveOnce);
      return saving;
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), saveDelayMs);
    };

    return {
      profile: null,
      load: () => {
        loading ??= repo
          .load()
          .catch(() => null)
          .then(async (stored) => {
            if (stored) {
              set({ profile: stored });
              return stored;
            }
            set({ profile: newProfile() });
            dirty = true;
            await flush();
            return get().profile!;
          });
        return loading;
      },
      update: (change) => {
        const p = get().profile;
        if (!p) return;
        set({ profile: { ...change(p), updatedAt: new Date().toISOString() } });
        dirty = true;
        schedule();
      },
      flush,
    };
  });
  return store;
}

export const profileStore = createProfileStore(new LocalProfileRepo());

/** Saves pending progress when the tab is hidden or closed. Returns an unsubscribe. */
export function startProfileAutosave(): () => void {
  const onHide = () => {
    if (document.visibilityState === 'hidden') void profileStore.getState().flush();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
  };
}
