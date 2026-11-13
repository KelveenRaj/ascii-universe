import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { uiStore } from '../state/ui';
import { PixelButton } from './controls';

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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;
  const close = () => uiStore.getState().setHelpOpen(false);

  return (
    <div className="help-backdrop" onClick={close} data-ui>
      <div
        ref={dialogRef}
        className="help frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <h2 id="help-title">CONTROLS</h2>
          <PixelButton onClick={close} title="Close (Esc)">
            X
          </PixelButton>
        </header>
        <div className="help-groups">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map(([k, v]) => (
                  <div key={k} className="help-row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
