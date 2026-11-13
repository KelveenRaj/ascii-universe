import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { statsStore } from '@/state/stats';
import styles from '@/ui/BootScreen.module.css';
import commonStyles from '@/ui/common.module.css';
import { cx } from '@/ui/cx';

const LINES = [
  'ASCII UNIVERSE BIOS V1.0',
  'MEMORY CHECK ......... 640K OK',
  'LOADING GLYPH ROM .... OK',
  'COMPILING GEODESICS .. OK',
  'INITIALIZING SINGULARITY',
];
const LINE_MS = 140;

/**
 * Retro boot text over a black screen. Hides the shader-compile hitch on the first frame, then
 * fades out once the engine reports it has drawn with the real glyph font.
 */
export function BootScreen() {
  const ready = useStore(statsStore, (s) => s.ready);
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduceMotion ? LINES.length : 0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (shown >= LINES.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), LINE_MS);
    return () => clearTimeout(t);
  }, [shown]);

  const done = ready && shown >= LINES.length;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setGone(true), 500); // matches the CSS fade
    return () => clearTimeout(t);
  }, [done]);

  if (gone) return null;
  return (
    <div id="boot-screen" className={cx(styles.boot, done && styles.done)} aria-hidden="true">
      <pre>
        {LINES.slice(0, shown).join('\n')}
        <span className={commonStyles.cursor}>_</span>
      </pre>
    </div>
  );
}
