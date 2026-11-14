import { useStore } from 'zustand';
import { childrenOf, pathTo } from '@/content/catalog';
import { gamesAt } from '@/games/registry';
import { navigationStore } from '@/state/navigation';
import commonStyles from '@/ui/common.module.css';
import { PixelButton } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/Navigator.module.css';

const short = (b: { designation?: string; name: string }) => b.designation ?? b.name.toUpperCase();

/**
 * Where you are and where you can go, bottom right: the path from the hub (each step warps back
 * there), a warp button per place inside the current one, and a button per minigame played here.
 */
export function Navigator() {
  const bodyId = useStore(navigationStore, (s) => s.bodyId);
  const { goTo, setGame } = navigationStore.getState();
  const path = pathTo(bodyId);
  const children = childrenOf(bodyId);
  const games = gamesAt(bodyId);

  return (
    <nav className={cx(commonStyles.frame, styles.nav)} aria-label="Navigator" data-ui>
      <ol className={styles.path}>
        {path.map((b, i) => (
          <li key={b.id}>
            {i < path.length - 1 ? (
              <button
                type="button"
                className={styles.crumb}
                onClick={() => goTo(b.id)}
                title={i === path.length - 2 ? 'Warp back (Backspace)' : 'Warp back'}
              >
                {short(b)}
              </button>
            ) : (
              <span className={styles.here} aria-current="location">
                {short(b)}
              </span>
            )}
          </li>
        ))}
      </ol>
      {(children.length > 0 || games.length > 0) && (
        <div className={styles.warps}>
          {children.map((b) => (
            <PixelButton key={b.id} onClick={() => goTo(b.id)} title={`Warp to ${b.name}`}>
              WARP &gt; {short(b)}
            </PixelButton>
          ))}
          {games.map((g) => (
            <PixelButton key={g.id} onClick={() => setGame(g.id)} title={g.blurb}>
              PLAY &gt; {g.title.toUpperCase()}
            </PixelButton>
          ))}
        </div>
      )}
    </nav>
  );
}
