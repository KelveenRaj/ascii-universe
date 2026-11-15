import { track } from '@/profile/EventSink';
import { CALLSIGN_MAX } from '@/profile/migrate';
import { navigationStore } from '@/state/navigation';
import { profileStore } from '@/state/profile';
import { cleanName } from '@/world/ship/design';

const WORDS = [
  'NOVA',
  'COMET',
  'ORBIT',
  'QUASAR',
  'PULSAR',
  'NEBULA',
  'VECTOR',
  'HALO',
  'ZENITH',
  'ION',
  'DRIFT',
  'EMBER',
  'VEGA',
  'LYRA',
  'RIGEL',
  'SOLAR',
];

/** A ready-made callsign (NOVA-42), for pilots who'd rather just fly. `rand` returns [0, 1). */
export function suggestCallsign(rand: () => number = Math.random): string {
  const word = WORDS[Math.floor(rand() * WORDS.length)];
  const n = 10 + Math.floor(rand() * 90);
  return `${word}-${n}`;
}

/** A new pilot in the open world: their profile is loaded and they haven't picked a callsign. */
export function needsCallsign(): boolean {
  const profile = profileStore.getState().profile;
  return navigationStore.getState().world && profile !== null && profile.pilot.callsign === '';
}

/** Sets the pilot's callsign (cleaned; a blank one gets a suggestion) and saves it now. */
export function setCallsign(raw: string): void {
  const callsign = cleanName(raw, CALLSIGN_MAX) || suggestCallsign();
  const isNew = profileStore.getState().profile?.pilot.callsign === '';
  profileStore.getState().update((p) => ({ ...p, pilot: { ...p.pilot, callsign } }));
  void profileStore.getState().flush();
  if (isNew) track('pilot_created');
}
