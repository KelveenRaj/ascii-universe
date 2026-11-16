import { useId, useState, type MouseEvent } from 'react';
import { useStore } from 'zustand';
import { getBody } from '@/content/catalog';
import { KIND_LABELS, type Body } from '@/content/schema';
import { navigationStore } from '@/state/navigation';
import { uiStore } from '@/state/ui';
import { worldStore } from '@/state/world';
import commonStyles from '@/ui/common.module.css';
import { Section } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/InfoPanel.module.css';
import { COMPACT_QUERY, useMedia } from '@/ui/useMedia';

/**
 * The info card, top left. Infographics mode: the body you're looking at, open by default. Flying:
 * the real body you're in contact with (a planet, the Sun, Sgr A*), appearing as you come near and
 * going when you leave; generated background stars have none. It opens as a short peek (name, one
 * line, a few facts) with MORE for the full card, and on phones always starts as the peek.
 * Not modal and doesn't take focus, so the camera and flight keys keep working.
 */
export function InfoPanel() {
  const world = useStore(navigationStore, (s) => s.world);
  const info = useStore(navigationStore, (s) => s.info);
  const bodyId = useStore(navigationStore, (s) => s.bodyId);
  const contact = useStore(worldStore, (s) => s.hud?.contact ?? null);
  const hidden = useStore(uiStore, (s) => s.contactHidden);

  const id = world ? contact : bodyId;
  if (!id) return null;
  const open = world ? hidden !== id : info;
  const setOpen = (on: boolean) => {
    if (world) uiStore.getState().setContactHidden(on ? null : id);
    else navigationStore.getState().setInfo(on);
  };

  if (!open) {
    return (
      <button
        type="button"
        className={cx(commonStyles.frame, styles.chip)}
        onClick={() => setOpen(true)}
        title="Show the info card (I)"
        aria-expanded={false}
        data-ui
        data-testid="info-chip"
      >
        INFO
      </button>
    );
  }
  // a fresh card per body, so it starts as a peek again
  return (
    <Card key={`${world}:${id}`} body={getBody(id)} flying={world} onClose={() => setOpen(false)} />
  );
}

function Card(props: { body: Body; flying: boolean; onClose: () => void }) {
  const { body } = props;
  const small = useMedia(COMPACT_QUERY);
  // wide screens in infographics mode have room for the whole card; everything else peeks
  const [expanded, setExpanded] = useState(!props.flying && !small);
  const titleId = useId();
  const ref = (sourceId: string) => body.sources.findIndex((s) => s.id === sourceId) + 1;
  const facts = expanded ? body.facts : body.facts.slice(0, small ? 2 : 3);

  return (
    <aside
      className={cx(commonStyles.frame, styles.panel, expanded && styles.tall)}
      aria-labelledby={titleId}
      data-ui
      data-testid="info-panel"
    >
      <header className={styles.head}>
        <span className={styles.kind}>{KIND_LABELS[body.kind]}</span>
        <button
          type="button"
          className={styles.close}
          onClick={props.onClose}
          aria-label="Close the info card"
          title="Close (I)"
        >
          X
        </button>
      </header>
      <div className={styles.body}>
        <h2 id={titleId} className={styles.name}>
          {body.name.toUpperCase()}
        </h2>
        <p className={styles.tagline}>
          {body.tagline}
          {expanded && <span className={commonStyles.cursor}>_</span>}
        </p>

        <Section title="DATA">
          <dl className={styles.facts}>
            {facts.map((f) => (
              <div key={f.label} className={styles.fact}>
                <dt>{f.label}</dt>
                <dd>
                  <span className={styles.value}>{f.value}</span>{' '}
                  {expanded && (
                    <a className={styles.ref} href={`#src-${f.source}`} onClick={jumpTo(f.source)}>
                      [{ref(f.source)}]
                    </a>
                  )}
                  {expanded && f.detail && <span className={styles.detail}>{f.detail}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        {expanded && (
          <>
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
          </>
        )}
      </div>
      <button
        type="button"
        className={styles.more}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? 'LESS' : 'MORE'}
      </button>
    </aside>
  );
}

/** Source refs scroll within the panel instead of changing the URL hash (which is the route). */
const jumpTo = (sourceId: string) => (e: MouseEvent) => {
  e.preventDefault();
  document.getElementById(`src-${sourceId}`)?.scrollIntoView({ block: 'nearest' });
};
