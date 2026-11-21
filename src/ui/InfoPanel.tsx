import { useId, useState, type MouseEvent } from 'react';
import { useStore } from 'zustand';
import { getBody } from '@/content/catalog';
import { KIND_LABELS, type Body } from '@/content/schema';
import { findTour, type TourStep } from '@/content/tours';
import { flyTo } from '@/state/launch';
import { navigationStore } from '@/state/navigation';
import { tourStore } from '@/state/tour';
import { uiStore } from '@/state/ui';
import { worldStore } from '@/state/world';
import commonStyles from '@/ui/common.module.css';
import { Section } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/InfoPanel.module.css';
import { COMPACT_QUERY, useMedia } from '@/ui/useMedia';
import { canFlyTo } from '@/world/places';

/**
 * The info card, top left. Infographics mode: the body you're looking at, open by default. Flying:
 * the real body you're in contact with (a planet, the Sun, Sgr A*), appearing as you come near and
 * going when you leave; generated background stars have none. It opens as a short peek (name, one
 * line, a few facts) with MORE for the full card, and on phones always starts as the peek.
 * During a guided tour the peek shows the step's question and facts, with the tour's buttons.
 * Not modal and doesn't take focus, so the camera and flight keys keep working.
 */
export function InfoPanel() {
  const world = useStore(navigationStore, (s) => s.world);
  const info = useStore(navigationStore, (s) => s.info);
  const bodyId = useStore(navigationStore, (s) => s.bodyId);
  const contact = useStore(worldStore, (s) => s.hud?.contact ?? null);
  const hidden = useStore(uiStore, (s) => s.contactHidden);
  const tourId = useStore(tourStore, (s) => s.tourId);
  const stepIndex = useStore(tourStore, (s) => s.step);

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
        aria-label="Show the info card"
        aria-expanded={false}
        data-ui
        data-testid="info-chip"
      >
        INFO
      </button>
    );
  }
  const tour = !world && tourId ? findTour(tourId) : undefined;
  const step = tour?.steps[stepIndex];
  // a fresh card per body and tour step, so it starts as a peek again
  return (
    <Card
      key={`${world}:${id}:${tourId}:${stepIndex}`}
      body={getBody(id)}
      flying={world}
      onClose={() => setOpen(false)}
      tour={
        tour && step
          ? { title: tour.title, index: stepIndex, total: tour.steps.length, step }
          : undefined
      }
    />
  );
}

interface TourInfo {
  title: string;
  index: number;
  total: number;
  step: TourStep;
}

function Card(props: { body: Body; flying: boolean; onClose: () => void; tour?: TourInfo }) {
  const { body, tour } = props;
  const small = useMedia(COMPACT_QUERY);
  // wide screens in infographics mode have room for the whole card; everything else peeks
  const [expanded, setExpanded] = useState(!props.flying && !small && !tour);
  const titleId = useId();
  const ref = (sourceId: string) => body.sources.findIndex((s) => s.id === sourceId) + 1;
  const peekFacts = tour
    ? tour.step.facts.flatMap((l) => body.facts.filter((f) => f.label === l))
    : body.facts.slice(0, small ? 2 : 3);
  const facts = expanded ? body.facts : peekFacts;
  const last = tour ? tour.index === tour.total - 1 : false;

  return (
    <aside
      className={cx(commonStyles.frame, styles.panel, expanded && styles.tall)}
      aria-labelledby={titleId}
      data-ui
      data-testid="info-panel"
    >
      <header className={styles.head}>
        <span className={styles.kind}>
          {tour ? `TOUR ${tour.index + 1}/${tour.total}` : KIND_LABELS[body.kind]}
        </span>
        <button
          type="button"
          className={styles.close}
          onClick={tour ? () => tourStore.getState().exit() : props.onClose}
          aria-label={tour ? 'End the tour' : 'Close the info card'}
          title={tour ? 'End the tour (Esc)' : 'Close (I)'}
        >
          X
        </button>
      </header>
      <div className={styles.body}>
        {tour && !expanded && <p className={styles.prompt}>{tour.step.prompt}</p>}
        <h2 id={titleId} className={styles.name}>
          {body.name.toUpperCase()}
        </h2>
        {(!tour || expanded) && (
          <p className={styles.tagline}>
            {body.tagline}
            {expanded && <span className={commonStyles.cursor}>_</span>}
          </p>
        )}

        <Section title="DATA">
          <dl className={styles.facts}>
            {facts.map((f) => (
              <div key={f.label} className={styles.fact}>
                <dt>{f.label}</dt>
                <dd>
                  <span className={styles.value}>{f.value}</span>{' '}
                  {(expanded || tour) && (
                    <a className={styles.ref} href={`#src-${f.source}`} onClick={jumpTo(f.source)}>
                      [{ref(f.source)}]
                    </a>
                  )}
                  {(expanded || tour) && f.detail && (
                    <span className={styles.detail}>{f.detail}</span>
                  )}
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
      <div className={styles.actions}>
        {tour && (
          <>
            <button
              type="button"
              className={styles.action}
              onClick={() => tourStore.getState().prev()}
              disabled={tour.index === 0}
            >
              BACK
            </button>
            <button
              type="button"
              className={cx(styles.action, styles.primary)}
              onClick={() => tourStore.getState().next()}
            >
              {last ? 'DONE' : 'NEXT'}
            </button>
          </>
        )}
        {!props.flying && canFlyTo(body.id) && (
          <button
            type="button"
            className={styles.action}
            onClick={() => flyTo(body.id)}
            title="Switch to exploration mode, with your ship right there"
          >
            FLY HERE
          </button>
        )}
        <button
          type="button"
          className={styles.action}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? 'LESS' : 'MORE'}
        </button>
      </div>
    </aside>
  );
}

/** Source refs scroll within the panel instead of changing the URL hash (which is the route). */
const jumpTo = (sourceId: string) => (e: MouseEvent) => {
  e.preventDefault();
  document.getElementById(`src-${sourceId}`)?.scrollIntoView({ block: 'nearest' });
};
