import { useStore } from 'zustand';
import { PALETTES } from '@/engine/display/palette/palettes';
import { settingsStore } from '@/state/settings';
import { statsStore } from '@/state/stats';
import { uiStore } from '@/state/ui';
import commonStyles from '@/ui/common.module.css';
import { PixelButton } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/Hud.module.css';

/** Game-style readout in the top-left corner. Re-renders ~4×/s at most (stats are throttled). */
export function Hud() {
  const fps = useStore(statsStore, (s) => s.fps);
  const sceneRows = useStore(statsStore, (s) => s.sceneRows);
  const cols = useStore(statsStore, (s) => s.cols);
  const rows = useStore(statsStore, (s) => s.rows);
  const steps = useStore(statsStore, (s) => s.steps);
  const attract = useStore(statsStore, (s) => s.attract);
  const qualityLabel = useStore(statsStore, (s) => s.qualityLabel);
  const palette = useStore(settingsStore, (s) => s.palette);
  const paused = useStore(settingsStore, (s) => s.paused);
  const ascii = useStore(settingsStore, (s) => s.ascii);
  const view = useStore(settingsStore, (s) => s.debugView);

  const rowsData: Array<[string, string]> = [
    ['FPS', String(fps)],
    ...sceneRows,
    ['GRID', ascii && cols > 0 ? `${cols}×${rows}` : 'SMOOTH'],
    ['STEPS', String(steps)],
    ['QUAL', qualityLabel],
    ['PAL', PALETTES[palette].label.toUpperCase()],
  ];
  const flags = [
    paused && 'PAUSED',
    attract && 'ATTRACT',
    view !== 'final' && `VIEW:${view.toUpperCase()}`,
  ].filter(Boolean);

  return (
    <aside className={cx(commonStyles.frame, styles.hud)} aria-label="Status">
      <div className={styles.title}>ASCII UNIVERSE</div>
      <dl className={styles.grid}>
        {rowsData.map(([k, v]) => (
          <div key={k} className={styles.row}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {flags.length > 0 && (
        <div className={cx(styles.flags, commonStyles.blink)}>{flags.join(' · ')}</div>
      )}
    </aside>
  );
}

/** Top-right buttons: settings and help. Always visible so touch users can reach everything. */
export function TopBar() {
  const panelOpen = useStore(uiStore, (s) => s.panelOpen);
  const helpOpen = useStore(uiStore, (s) => s.helpOpen);
  const { setPanelOpen, setHelpOpen } = uiStore.getState();
  return (
    <div className={styles.topbar} data-ui>
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

export function KeyHint() {
  return (
    <div className={styles.keyHint} aria-hidden="true">
      TAB SETTINGS · ? HELP · C COPY TEXT · H HUD · DRAG ORBIT · WHEEL ZOOM
    </div>
  );
}
