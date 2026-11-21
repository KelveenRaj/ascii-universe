import { useStore } from 'zustand';
import { navigationStore } from '@/state/navigation';
import { worldStore } from '@/state/world';
import commonStyles from '@/ui/common.module.css';
import { PixelButton } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/FlightHud.module.css';
import { flightPad } from '@/world/flight/pad';

/** A touch button that holds a flight key down while pressed. */
function HoldButton(props: { code: string; label: string; title: string }) {
  const release = () => flightPad.hold(props.code, false);
  return (
    <button
      type="button"
      className={styles.pad}
      title={props.title}
      aria-label={props.title}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        flightPad.hold(props.code, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {props.label}
    </button>
  );
}

const BAR_CELLS = 10;

/**
 * The exploration mode's screen furniture, kept small: a slim readout bottom-left (where you are,
 * speed, throttle, the target), notices, and along the bottom the jump / hangar / land buttons and,
 * on touch screens, throttle, boost, stop and target buttons (steering is dragging the screen).
 * The map and the info card live up top; see Minimap and InfoPanel.
 */
export function FlightHud() {
  const world = useStore(navigationStore, (s) => s.world);
  const hud = useStore(worldStore, (s) => s.hud);
  // the hangar panel takes a side of the screen, and the ship needs the rest
  const hangarOpen = useStore(worldStore, (s) => s.hangarOpen);
  if (!world) return null;
  const land = () => navigationStore.getState().setWorld(false);
  const jump = () => worldStore.getState().request({ type: 'jump' });

  const filled = Math.round((hud?.throttle ?? 0) * BAR_CELLS);
  const bar = '▮'.repeat(filled) + '▯'.repeat(BAR_CELLS - filled);
  const row = (key: string) => hud?.rows.find(([k]) => k === key)?.[1];
  const target = row('TARGET');
  const dist = row('DIST');
  // detail rows after speed and throttle, minus the target (shown on its own line)
  const extra = (hud?.rows ?? []).filter(
    ([k]) => !['SPEED', 'THROTTLE', 'TARGET', 'DIST'].includes(k),
  );

  return (
    <>
      {hud?.message && (
        <div
          className={cx(commonStyles.frame, styles.toast)}
          role="status"
          data-testid="world-message"
        >
          <p>{hud.message}</p>
        </div>
      )}

      <div className={styles.dock} data-ui>
        <aside
          className={cx(commonStyles.frame, styles.readout)}
          aria-label="Flight"
          data-testid="flight-panel"
        >
          <div className={styles.title}>{hud?.title ?? 'OPEN SPACE'}</div>
          <dl className={styles.grid}>
            <div className={styles.row}>
              <dt>SPEED</dt>
              <dd>{hud?.speed ?? '0'}</dd>
            </div>
            <div className={styles.row}>
              <dt>THROTTLE</dt>
              <dd>
                <span className={styles.bar} aria-hidden="true">
                  {bar}
                </span>
                <span className={styles.sr}>{Math.round((hud?.throttle ?? 0) * 100)}%</span>
              </dd>
            </div>
            {extra.map(([k, v]) => (
              <div key={k} className={cx(styles.row, styles.extra)}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            {target && (
              <div className={cx(styles.row, styles.target)}>
                <dt>&gt; {target}</dt>
                <dd>{dist}</dd>
              </div>
            )}
          </dl>
        </aside>

        {!hangarOpen && (
          <div className={styles.right}>
            <div className={styles.hint} aria-hidden="true">
              {hud?.hint}
            </div>
            <div className={cx(styles.pads, styles.touchPads)} data-testid="touch-pads">
              <HoldButton code="KeyS" label="THR-" title="Throttle down (S)" />
              <HoldButton code="KeyW" label="THR+" title="Throttle up (W)" />
              <HoldButton code="ShiftLeft" label="BST" title="Boost (Shift)" />
              <HoldButton code="KeyX" label="STOP" title="Stop (X)" />
              <button
                type="button"
                className={styles.pad}
                title="Target what you face (T)"
                aria-label="Target what you face (T)"
                onClick={() => flightPad.press('KeyT')}
              >
                TGT
              </button>
            </div>
            <div className={styles.pads}>
              {hud?.action && (
                <PixelButton
                  onClick={jump}
                  title={
                    hud.action === 'JUMP' ? 'Jump to the target (J)' : 'Back to open space (J)'
                  }
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
              <PixelButton onClick={land} title="Back to the infographics (Esc)">
                LAND
              </PixelButton>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
