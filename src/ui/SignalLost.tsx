import { useStore } from 'zustand';
import { statsStore } from '@/state/stats';
import commonStyles from '@/ui/common.module.css';
import { cx } from '@/ui/cx';
import styles from '@/ui/SignalLost.module.css';

/** Shown while the browser has taken the GPU context away (driver reset, too many tabs, …). */
export function SignalLost() {
  const lost = useStore(statsStore, (s) => s.signalLost);
  if (!lost) return null;
  return (
    <div id="signal-lost" className={styles.screen} role="alert">
      <p className={cx(styles.title, commonStyles.blink)}>SIGNAL LOST</p>
      <p>GPU CONTEXT DROPPED · REACQUIRING</p>
      <p className={commonStyles.cursor}>_</p>
    </div>
  );
}
