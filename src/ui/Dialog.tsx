import { useEffect, useId, useRef, type ReactNode } from 'react';
import commonStyles from '@/ui/common.module.css';
import { PanelHeader } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/Dialog.module.css';

/**
 * Modal dialog over a dimmed backdrop: framed box, title bar, close on backdrop click (Esc is
 * handled globally in useGlobalKeys). Takes focus when it mounts, so render it only while open.
 */
export function Dialog(props: {
  title: string;
  onClose: () => void;
  /** Extra class for sizing/layout of the box. */
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className={styles.backdrop} onClick={props.onClose} data-ui>
      <div
        ref={ref}
        className={cx(commonStyles.frame, styles.dialog, props.className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <PanelHeader title={props.title} titleId={titleId} onClose={props.onClose} />
        {props.children}
      </div>
    </div>
  );
}
