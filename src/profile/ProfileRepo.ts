import type { PilotProfile } from '@/profile/schema';

/** A save went through (`rev` is the new revision), or the stored copy moved on since `baseRev`. */
export type SaveResult = { ok: true; rev: number } | { ok: false; conflict: PilotProfile };

/**
 * Where pilot profiles are kept. LocalProfileRepo (the browser) for now; an API-backed repo later
 * (`GET`/`PUT /api/save/:playerId`, 409 on a stale rev) slots in behind the same interface.
 */
export interface ProfileRepo {
  load(): Promise<PilotProfile | null>;
  /** Stores `profile` if the stored copy is still at `baseRev`; the stored rev becomes baseRev + 1. */
  save(profile: PilotProfile, baseRev: number): Promise<SaveResult>;
}
