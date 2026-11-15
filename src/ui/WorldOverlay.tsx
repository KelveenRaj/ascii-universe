import { useStore } from 'zustand';
import { navigationStore } from '@/state/navigation';
import { settingsStore } from '@/state/settings';
import { worldStore } from '@/state/world';
import commonStyles from '@/ui/common.module.css';
import { PixelButton } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/GameOverlay.module.css';
import own from '@/ui/WorldOverlay.module.css';

/**
 * The open world's screen furniture while you fly: the flight readout top-left (in place of the
 * HUD), places to target top-right, notices (discoveries, jumps), control hints, and buttons to
 * jump and land. Same look as a minigame's overlay.
 */
export function WorldOverlay() {
  const world = useStore(navigationStore, (s) => s.world);
  const hud = useStore(worldStore, (s) => s.hud);
  const asciiOn = useStore(settingsStore, (s) => s.ascii && s.debugView === 'final');
  if (!world) return null;
  const land = () => navigationStore.getState().setWorld(false);
  const jump = () => worldStore.getState().request({ type: 'jump' });
  const pick = (id: string) => worldStore.getState().request({ type: 'target', id });
  const targets = hud?.targets ?? [];
  // in open space the list is nearby systems first, then landmarks (no ':' or '/' in their ids)
  const firstLandmark = targets.findIndex((t) => !t.id.includes(':') && !t.id.includes('/'));

  return (
    <>
      <aside
        className={cx(commonStyles.frame, styles.panel)}
        aria-label="Flight"
        data-testid="flight-panel"
      >
        <div className={styles.title}>{hud?.title ?? 'OPEN SPACE'}</div>
        <dl className={styles.grid}>
          {hud?.rows.map(([k, v]) => (
            <div key={k} className={styles.row}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </aside>

      {targets.length > 0 && (
        <nav
          className={cx(commonStyles.frame, own.targets)}
          aria-label="Targets"
          data-testid="target-list"
          data-ui
        >
          <div className={styles.title}>TARGETS</div>
          <ul className={own.list}>
            {targets.map((t, i) => (
              <li key={t.id}>
                {i === firstLandmark && i > 0 && <div className={own.divider} />}
                <button
                  type="button"
                  className={cx(own.target, t.selected && own.selected)}
                  onClick={() => pick(t.id)}
                  title={t.kind}
                  aria-pressed={t.selected}
                >
                  <span>{t.name}</span>
                  <span className={own.dist}>{t.dist}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {hud?.message && (
        <div
          className={cx(commonStyles.frame, styles.message, own.toast)}
          role="status"
          data-testid="world-message"
        >
          <p>{hud.message}</p>
        </div>
      )}

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
          {hud?.action && (
            <PixelButton
              onClick={jump}
              title={hud.action === 'JUMP' ? 'Jump to the target (J)' : 'Back to open space (J)'}
            >
              {hud.action}
            </PixelButton>
          )}
          <PixelButton
            onClick={() => worldStore.setState({ hangarOpen: true })}
            title="Design your ship"
          >
            HANGAR
          </PixelButton>
          <PixelButton onClick={land} title="Land (Esc)">
            LAND
          </PixelButton>
        </div>
      </div>
    </>
  );
}
