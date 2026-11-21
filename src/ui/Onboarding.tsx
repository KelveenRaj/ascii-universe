import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { CALLSIGN_MAX } from '@/profile/migrate';
import { navigationStore } from '@/state/navigation';
import { profileStore } from '@/state/profile';
import { PixelButton, Section } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { FLIGHT_GROUPS } from '@/ui/flightControls';
import { ControlGroups } from '@/ui/HelpOverlay';
import styles from '@/ui/Onboarding.module.css';
import { setCallsign, suggestCallsign } from '@/world/pilot';
import { cleanName } from '@/world/ship/design';

/**
 * The first time you fly: pick a callsign (or keep the suggested one) and see the controls.
 * Closing it any way (LAUNCH, Esc, the backdrop) keeps whatever is in the box.
 */
export function Onboarding() {
  const world = useStore(navigationStore, (s) => s.world);
  const isNew = useStore(
    profileStore,
    (s) => s.profile !== null && s.profile.pilot.callsign === '',
  );
  if (!world || !isNew) return null;
  return <NewPilot />;
}

function NewPilot() {
  const [name, setName] = useState(suggestCallsign);
  const launch = () => setCallsign(name);
  // Esc launches too, with what's in the box (useGlobalKeys leaves Esc to us while this is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCallsign(name);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [name]);

  return (
    <Dialog title="NEW PILOT" onClose={launch} className={styles.onboarding}>
      <form
        className={styles.body}
        data-testid="onboarding"
        onSubmit={(e) => {
          e.preventDefault();
          launch();
        }}
      >
        <p className={styles.intro}>
          Your ship is ready. Fly anywhere in the Milky Way, jump to Sol or Sgr A* from the map, and
          fly right up to the Sun, the planets and the black hole. Everything you find is logged
          under your callsign.
        </p>
        <Section title="CALLSIGN">
          <input
            className={styles.callsign}
            aria-label="Callsign"
            value={name}
            maxLength={CALLSIGN_MAX}
            onChange={(e) => setName(cleanName(e.target.value, CALLSIGN_MAX))}
          />
        </Section>
        <ControlGroups groups={FLIGHT_GROUPS} />
        <div className={styles.launch}>
          <PixelButton type="submit" title="Start flying (Enter)">
            LAUNCH
          </PixelButton>
        </div>
      </form>
    </Dialog>
  );
}
