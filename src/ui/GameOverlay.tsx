import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { GameAction } from '@/engine/game/Game';
import { findGame } from '@/games/registry';
import { sendCommand } from '@/state/commands';
import { gameStore } from '@/state/game';
import { navigationStore } from '@/state/navigation';
import { settingsStore } from '@/state/settings';
import commonStyles from '@/ui/common.module.css';
import { PixelButton } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/GameOverlay.module.css';

const press = (action: GameAction) => sendCommand({ type: 'gameAction', action });

/** A touch button that keeps pressing while held, like a held key. */
function RepeatButton(props: { action: GameAction; label: string; title: string }) {
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <button
      type="button"
      className={styles.pad}
      title={props.title}
      aria-label={props.title}
      onPointerDown={(e) => {
        e.preventDefault();
        press(props.action);
        stop();
        timer.current = window.setInterval(() => press(props.action), 60);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); // the button handles it
      }}
      onClick={(e) => {
        if (e.detail === 0) press(props.action); // keyboard activation
      }}
    >
      {props.label}
    </button>
  );
}

/**
 * The running minigame's screen furniture: readout top-left (in place of the HUD), a message
 * box (title / round result), control hints, and on-screen controls for touch.
 */
export function GameOverlay() {
  const gameId = useStore(navigationStore, (s) => s.game);
  const hud = useStore(gameStore, (s) => s.hud);
  const asciiOn = useStore(settingsStore, (s) => s.ascii && s.debugView === 'final');
  if (!gameId) return null;
  const game = findGame(gameId);
  const quit = () => navigationStore.getState().setGame(null);

  return (
    <>
      <aside
        className={cx(commonStyles.frame, styles.panel)}
        aria-label="Game"
        data-testid="game-panel"
      >
        <div className={styles.title}>{game?.title.toUpperCase()}</div>
        <dl className={styles.grid}>
          {hud?.rows.map(([k, v]) => (
            <div key={k} className={styles.row}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </aside>

      {(hud?.message || !asciiOn) && (
        <div className={cx(commonStyles.frame, styles.message)} role="status">
          {asciiOn && hud?.message ? (
            <>
              <div className={styles.messageTitle}>{hud.message.title}</div>
              {hud.message.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </>
          ) : (
            <p>Games are drawn in ASCII. Turn it back on (G) to play.</p>
          )}
        </div>
      )}

      <div className={styles.controls} data-ui>
        <div className={styles.hint} aria-hidden="true">
          {hud?.hint}
        </div>
        <div className={styles.pads}>
          <RepeatButton action="left" label="<" title="Aim left" />
          <RepeatButton action="right" label=">" title="Aim right" />
          <RepeatButton action="down" label="-" title="Slower" />
          <RepeatButton action="up" label="+" title="Faster" />
          <PixelButton onClick={() => press('fire')} title="Launch / again (Space)">
            GO
          </PixelButton>
          <PixelButton onClick={quit} title="Quit (Esc)">
            QUIT
          </PixelButton>
        </div>
      </div>
    </>
  );
}
