import { useId, type MouseEvent } from 'react';
import { useStore } from 'zustand';
import { getBody } from '@/content/catalog';
import { KIND_LABELS } from '@/content/schema';
import { navigationStore } from '@/state/navigation';
import commonStyles from '@/ui/common.module.css';
import { PanelHeader, Section } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/InfoPanel.module.css';

/**
 * The current body's info card: a data-terminal readout on the left, so the scene stays in view.
 * Not modal and doesn't take focus, so the camera keys keep working while it's open.
 */
export function InfoPanel() {
  const open = useStore(navigationStore, (s) => s.info);
  const bodyId = useStore(navigationStore, (s) => s.bodyId);
  const titleId = useId();
  if (!open) return null;

  const body = getBody(bodyId);
  const ref = (sourceId: string) => body.sources.findIndex((s) => s.id === sourceId) + 1;
  const close = () => navigationStore.getState().setInfo(false);

  return (
    <aside
      className={cx(commonStyles.frame, styles.panel)}
      aria-labelledby={titleId}
      data-ui
      data-testid="info-panel"
    >
      <PanelHeader
        title={`INFO // ${body.designation ?? body.name.toUpperCase()}`}
        onClose={close}
      />
      <div className={styles.body}>
        <div className={styles.kind}>{KIND_LABELS[body.kind]}</div>
        <h2 id={titleId} className={styles.name}>
          {body.name.toUpperCase()}
        </h2>
        <p className={styles.tagline}>
          {body.tagline}
          <span className={commonStyles.cursor}>_</span>
        </p>

        <Section title="DATA">
          <dl className={styles.facts}>
            {body.facts.map((f) => (
              <div key={f.label} className={styles.fact}>
                <dt>{f.label}</dt>
                <dd>
                  <span className={styles.value}>{f.value}</span>{' '}
                  <a className={styles.ref} href={`#src-${f.source}`} onClick={jumpTo(f.source)}>
                    [{ref(f.source)}]
                  </a>
                  {f.detail && <span className={styles.detail}>{f.detail}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="LOG">
          {body.summary.map((p) => (
            <p key={p} className={styles.paragraph}>
              {p}
            </p>
          ))}
        </Section>

        <Section title="SOURCES">
          <ol className={styles.sources}>
            {body.sources.map((s, i) => (
              <li key={s.id} id={`src-${s.id}`}>
                <span className={styles.ref}>[{i + 1}]</span>{' '}
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
                <span className={styles.detail}>
                  {s.publisher}, {s.year}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </aside>
  );
}

/** Source refs scroll within the panel instead of changing the URL hash (which is the route). */
const jumpTo = (sourceId: string) => (e: MouseEvent) => {
  e.preventDefault();
  document.getElementById(`src-${sourceId}`)?.scrollIntoView({ block: 'nearest' });
};
