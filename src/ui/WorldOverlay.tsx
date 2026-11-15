import { useStore } from 'zustand';
import { navigationStore } from '@/state/navigation';
import { settingsStore } from '@/state/settings';
import { worldStore } from '@/state/world';
import commonStyles from '@/ui/common.module.css';
import { PixelButton } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/GameOverlay.module.css';

/**
 * The open world's screen furniture while you fly: the flight readout top-left (in place of the
 * HUD), control hints, and a button to land. Same look as a minigame's overlay.
 */
export function WorldOverlay() {
  const world = useStore(navigationStore, (s) => s.world);
  const hud = useStore(worldStore, (s) => s.hud);
  const asciiOn = useStore(settingsStore, (s) => s.ascii && s.debugView === 'final');
  if (!world) return null;
  const land = () => navigationStore.getState().setWorld(false);

  return (
    <>
      <aside
        className={cx(commonStyles.frame, styles.panel)}
        aria-label="Flight"
        data-testid="flight-panel"
      >
        <div className={styles.title}>OPEN SPACE</div>
        <dl className={styles.grid}>
          {hud?.rows.map(([k, v]) => (
            <div key={k} className={styles.row}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </aside>

      {!asciiOn && (
        <div className={cx(commonStyles.frame, styles.message)} role="status">
          <p>Your ship is drawn in ASCII. Turn it back on (G) to see it.</p>
        </div>
      )}

      <div className={styles.controls} data-ui>
        <div className={styles.hint} aria-hidden="true">
          {hud?.hint}
        </div>
        <div className={styles.pads}>
          <PixelButton onClick={land} title="Land (Esc)">
            LAND
          </PixelButton>
        </div>
      </div>
    </>
  );
}
