import { useState } from 'react';
import { useStore } from 'zustand';
import { TOURS } from '@/content/tours';
import { sendCommand } from '@/state/commands';
import { navigationStore } from '@/state/navigation';
import { tourStore } from '@/state/tour';
import { uiStore } from '@/state/ui';
import commonStyles from '@/ui/common.module.css';
import { PixelButton } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/Dock.module.css';

/** A button with a small menu opening above it. */
function Menu(props: {
  label: string;
  title: string;
  items: Array<{ key: string; label: string; hint?: string; run: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.menu}>
      <PixelButton onClick={() => setOpen(!open)} title={props.title} aria-expanded={open}>
        {props.label}
      </PixelButton>
      {open && (
        <ul className={cx(commonStyles.frame, styles.list)} data-ui>
          {props.items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className={styles.item}
                onClick={() => {
                  setOpen(false);
                  item.run();
                }}
              >
                <span>{item.label}</span>
                {item.hint && <span className={styles.hint}>{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Copy a link to this view, or save the frame as a PNG. */
export function ShareMenu() {
  const world = useStore(navigationStore, (s) => s.world);
  return (
    <Menu
      label="SHARE"
      title="Share this view"
      items={[
        ...(world
          ? []
          : [
              {
                key: 'link',
                label: 'COPY LINK',
                hint: 'this place, this angle',
                run: () => sendCommand({ type: 'copyLink' }),
              },
            ]),
        {
          key: 'image',
          label: 'SAVE IMAGE',
          hint: 'PNG of the screen',
          run: () => sendCommand({ type: 'captureImage' }),
        },
        {
          key: 'text',
          label: 'COPY AS TEXT',
          hint: 'plain text frame (C)',
          run: () => sendCommand({ type: 'captureText' }),
        },
      ]}
    />
  );
}

/** Bottom right in infographics mode: guided tours and sharing. */
export function InfoDock() {
  const world = useStore(navigationStore, (s) => s.world);
  const touring = useStore(tourStore, (s) => s.tourId !== null);
  if (world) return null;
  return (
    <div className={styles.dock} data-ui data-testid="info-dock">
      {!touring && (
        <Menu
          label="TOURS"
          title="Guided tours"
          items={TOURS.map((t) => ({
            key: t.id,
            label: t.title,
            hint: t.blurb,
            run: () => tourStore.getState().start(t.id),
          }))}
        />
      )}
      <ShareMenu />
    </div>
  );
}

/** A short notice (LINK COPIED, IMAGE SAVED) above the bottom edge. */
export function Notice() {
  const notice = useStore(uiStore, (s) => s.notice);
  if (!notice) return null;
  return (
    <div className={cx(commonStyles.frame, styles.notice)} role="status">
      {notice}
    </div>
  );
}
