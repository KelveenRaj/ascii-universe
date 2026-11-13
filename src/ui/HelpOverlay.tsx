import { useStore } from 'zustand';
import { uiStore } from '@/state/ui';
import { Section } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import styles from '@/ui/HelpOverlay.module.css';

const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'MOUSE',
    rows: [
      ['DRAG', 'ORBIT'],
      ['RIGHT / SHIFT-DRAG', 'PAN'],
      ['WHEEL', 'ZOOM'],
      ['DOUBLE-CLICK', 'RESET VIEW'],
    ],
  },
  {
    title: 'TOUCH',
    rows: [
      ['1 FINGER', 'ORBIT'],
      ['2 FINGERS', 'PAN'],
      ['PINCH', 'ZOOM'],
      ['TWIST', 'ROLL'],
      ['DOUBLE-TAP', 'RESET VIEW'],
    ],
  },
  {
    title: 'KEYBOARD',
    rows: [
      ['WASD / ARROWS', 'ORBIT'],
      ['SHIFT + WASD', 'PAN'],
      ['Q / E', 'ROLL'],
      ['Z / X  + / -', 'ZOOM'],
      ['1 2 3', 'EDGE-ON / EHT / TOP'],
      ['0 / HOME', 'RESET VIEW'],
      ['SPACE', 'PAUSE DISK'],
      ['[ ]', 'GLYPH SIZE'],
      ['C', 'COPY AS TEXT'],
      ['R / P', 'CHARACTERS / PALETTE'],
      ['B / T', 'BLOOM / CRT'],
      ['G / V', 'ASCII / DEBUG VIEW'],
      ['TAB / H / ?', 'SETTINGS / HUD / HELP'],
    ],
  },
];

export function HelpOverlay() {
  const open = useStore(uiStore, (s) => s.helpOpen);
  if (!open) return null;

  return (
    <Dialog
      title="CONTROLS"
      onClose={() => uiStore.getState().setHelpOpen(false)}
      className={styles.help}
    >
      <div className={styles.groups}>
        {GROUPS.map((g) => (
          <Section key={g.title} title={g.title}>
            <dl className={styles.list}>
              {g.rows.map(([k, v]) => (
                <div key={k} className={styles.row}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ))}
      </div>
    </Dialog>
  );
}
