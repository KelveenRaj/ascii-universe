import { useStore } from 'zustand';
import { navigationStore } from '@/state/navigation';
import { settingsStore } from '@/state/settings';
import { statsStore } from '@/state/stats';
import { uiStore } from '@/state/ui';
import commonStyles from '@/ui/common.module.css';
import { PixelButton } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/Hud.module.css';

/**
 * One quiet line bottom-left in infographics mode: the frame rate and the scene's own readout
 * (distance, tilt…). Re-renders ~4×/s at most (stats are throttled). H hides it.
 */
export function StatusLine() {
  const fps = useStore(statsStore, (s) => s.fps);
  const sceneRows = useStore(statsStore, (s) => s.sceneRows);
  const attract = useStore(statsStore, (s) => s.attract);
  const paused = useStore(settingsStore, (s) => s.paused);
  const view = useStore(settingsStore, (s) => s.debugView);

  const rows: Array<[string, string]> = [...sceneRows, ['FPS', String(fps)]];
  const flags = [
    paused && 'PAUSED',
    attract && 'ATTRACT',
    view !== 'final' && `VIEW:${view.toUpperCase()}`,
  ].filter(Boolean);

  return (
    <aside className={styles.status} aria-label="Status">
      <dl className={styles.statusRows}>
        {rows.map(([k, v]) => (
          <div key={k} className={styles.statusRow}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {flags.length > 0 && (
        <span className={cx(styles.flags, commonStyles.blink)}>{flags.join(' · ')}</span>
      )}
    </aside>
  );
}

/**
 * Top right: the two modes (look around the infographics, or fly your own ship), help and
 * settings. Always visible, so touch users can reach everything.
 */
export function TopBar() {
  const panelOpen = useStore(uiStore, (s) => s.panelOpen);
  const helpOpen = useStore(uiStore, (s) => s.helpOpen);
  const world = useStore(navigationStore, (s) => s.world);
  const { setPanelOpen, setHelpOpen } = uiStore.getState();
  const setWorld = navigationStore.getState().setWorld;
  return (
    <div className={styles.topbar} data-ui>
      <div className={styles.modes} role="group" aria-label="Mode">
        <button
          type="button"
          className={cx(styles.mode, !world && styles.modeOn)}
          aria-pressed={!world}
          aria-label="Infographics mode"
          title="Infographics: warp between places and read about them"
          onClick={() => setWorld(false)}
        >
          INFO
        </button>
        <button
          type="button"
          className={cx(styles.mode, world && styles.modeOn)}
          aria-pressed={world}
          aria-label="Exploration mode"
          title="Exploration: fly your own ship"
          onClick={() => setWorld(true)}
        >
          FLY
        </button>
      </div>
      <PixelButton
        onClick={() => setHelpOpen(!helpOpen)}
        title="Controls (?)"
        aria-expanded={helpOpen}
      >
        ?
      </PixelButton>
      <PixelButton
        onClick={() => setPanelOpen(!panelOpen)}
        title="Settings (Tab)"
        aria-expanded={panelOpen}
        aria-controls="settings-panel"
      >
        <span className={styles.iconMenu} aria-hidden="true" />
        <span className={styles.topbarLabel}> SETTINGS</span>
      </PixelButton>
    </div>
  );
}

/** Bottom line on a keyboard-and-mouse screen, infographics mode. */
export function KeyHint() {
  return (
    <div className={styles.keyHint} aria-hidden="true">
      DRAG ORBIT · WHEEL ZOOM · PICK A PLACE ON THE MAP · I CARD · TAB SETTINGS · ? HELP
    </div>
  );
}
