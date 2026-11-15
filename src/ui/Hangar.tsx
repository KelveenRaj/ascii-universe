import { useEffect, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { TEXT_SWATCHES } from '@/engine/display/TextLayer';
import { track } from '@/profile/EventSink';
import { profileStore } from '@/state/profile';
import { worldStore } from '@/state/world';
import { PixelButton, Section } from '@/ui/controls';
import { cx } from '@/ui/cx';
import { Dialog } from '@/ui/Dialog';
import styles from '@/ui/Hangar.module.css';
import { shipViews } from '@/world/ship/compose';
import {
  cleanName,
  DEFAULT_SHIP,
  ENGINES,
  HULLS,
  NAME_MAX,
  SHIP_COLORS,
  TRAIL_GLYPHS,
  WINGS,
  type ShipColorId,
  type ShipDesign,
} from '@/world/ship/design';
import {
  ENGINE_PARTS,
  HULL_PARTS,
  WING_PARTS,
  type ScreenCell,
  type Tone,
} from '@/world/ship/parts';

const HEX = Object.fromEntries(TEXT_SWATCHES.map((s) => [s.id, s.hex])) as Record<
  ShipColorId,
  string
>;

/** Preview spin: the 8 side views turning, then from behind and ahead. */
const SPIN = [
  'side:0',
  'side:7',
  'side:6',
  'side:5',
  'side:4',
  'side:3',
  'side:2',
  'side:1',
  'rear',
  'front',
];
const SPIN_MS = 450;
/** Preview grid size (cells). */
const COLS = 11;
const ROWS = 7;

const TRAIL_LABEL = { dots: 'DOTS', dashes: 'DASHES', stars: 'STARS', sparks: 'SPARKS' };
const LENGTH_LABEL = ['OFF', 'SHORT', 'LONG'];

const next = <T,>(list: readonly T[], v: T, step: 1 | -1) =>
  list[(list.indexOf(v) + step + list.length) % list.length];

/** The ship drawn in a small character grid, in its colours, one view at a time. */
function ShipPreview({ design, view }: { design: ShipDesign; view: string }) {
  const views = shipViews(design);
  const cells: ScreenCell[] =
    view === 'rear'
      ? views.rear
      : view === 'front'
        ? views.front
        : views.side[Number(view.slice(5))];
  const grid: Array<Array<{ ch: string; tone: Tone } | null>> = Array.from({ length: ROWS }, () =>
    Array<{ ch: string; tone: Tone } | null>(COLS).fill(null),
  );
  const c0 = Math.floor(COLS / 2);
  const r0 = Math.floor(ROWS / 2);
  for (const { dc, dr, ch, tone } of cells) {
    const row = grid[r0 + dr];
    if (row && c0 + dc >= 0 && c0 + dc < COLS) row[c0 + dc] = { ch, tone };
  }
  const color = (tone: Tone): CSSProperties['color'] =>
    tone === 'main' ? HEX[design.color] : tone === 'glow' ? 'var(--accent)' : 'var(--ink-dim)';
  return (
    <pre
      className={styles.preview}
      aria-label={`${design.name}, preview`}
      data-testid="ship-preview"
    >
      {grid.map((row, r) => (
        <div key={r}>
          {row.map((cell, c) =>
            cell ? (
              <span key={c} style={{ color: color(cell.tone) }}>
                {cell.ch}
              </span>
            ) : (
              ' '
            ),
          )}
        </div>
      ))}
    </pre>
  );
}

/** ◀ NAME ▶ for one part slot. */
function Picker(props: { label: string; value: string; onStep: (step: 1 | -1) => void }) {
  return (
    <div className={styles.picker}>
      <span className={styles.pickerLabel}>{props.label}</span>
      <PixelButton onClick={() => props.onStep(-1)} title={`Previous ${props.label.toLowerCase()}`}>
        {'<'}
      </PixelButton>
      <span className={styles.pickerValue} data-testid={`pick-${props.label.toLowerCase()}`}>
        {props.value}
      </span>
      <PixelButton onClick={() => props.onStep(1)} title={`Next ${props.label.toLowerCase()}`}>
        {'>'}
      </PixelButton>
    </div>
  );
}

function Swatches(props: { label: string; value: ShipColorId; onPick: (c: ShipColorId) => void }) {
  return (
    <div className={styles.swatches} role="radiogroup" aria-label={props.label}>
      {SHIP_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === props.value}
          aria-label={c}
          title={c.toUpperCase()}
          className={cx(styles.swatch, c === props.value && styles.swatchOn)}
          style={{ background: HEX[c] }}
          onClick={() => props.onPick(c)}
        />
      ))}
    </div>
  );
}

/**
 * The hangar: design your ship. Hull, wings and engine, a colour, a name, and the trail it leaves.
 * Every change is saved to your pilot profile straight away and shows on the ship in flight.
 */
export function Hangar() {
  const open = useStore(worldStore, (s) => s.hangarOpen);
  const ship = useStore(profileStore, (s) => s.profile?.ship ?? DEFAULT_SHIP);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!open) return;
    void profileStore.getState().load();
    // however the hangar closes (DONE, Esc, leaving the world), the design is saved right away
    track('hangar_open');
    const save = () => {
      void profileStore.getState().flush();
      const ship = profileStore.getState().profile?.ship;
      if (ship) {
        const { hull, wings, engine, color } = ship;
        track('ship_saved', { hull, wings, engine, color });
      }
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) return save;
    const id = setInterval(() => setFrame((f) => f + 1), SPIN_MS);
    return () => {
      clearInterval(id);
      save();
    };
  }, [open]);

  if (!open) return null;
  const close = () => worldStore.setState({ hangarOpen: false });
  const set = (change: Partial<ShipDesign>) =>
    profileStore.getState().update((p) => ({ ...p, ship: { ...p.ship, ...change } }));
  const setTrail = (change: Partial<ShipDesign['trail']>) =>
    set({ trail: { ...ship.trail, ...change } });

  return (
    <Dialog title="HANGAR" onClose={close} className={styles.hangar}>
      <div className={styles.body} data-testid="hangar">
        <div className={styles.left}>
          <ShipPreview design={ship} view={SPIN[frame % SPIN.length]} />

          <Section title="NAME">
            <input
              className={styles.name}
              aria-label="Ship name"
              value={ship.name}
              maxLength={NAME_MAX}
              spellCheck={false}
              onChange={(e) => set({ name: cleanName(e.target.value) || ship.name })}
            />
          </Section>
        </div>

        <div className={styles.right}>
          <Section title="PARTS">
            <Picker
              label="HULL"
              value={HULL_PARTS[ship.hull].label}
              onStep={(s) => set({ hull: next(HULLS, ship.hull, s) })}
            />
            <Picker
              label="WINGS"
              value={WING_PARTS[ship.wings].label}
              onStep={(s) => set({ wings: next(WINGS, ship.wings, s) })}
            />
            <Picker
              label="ENGINE"
              value={ENGINE_PARTS[ship.engine].label}
              onStep={(s) => set({ engine: next(ENGINES, ship.engine, s) })}
            />
          </Section>

          <Section title="COLOUR">
            <Swatches label="Ship colour" value={ship.color} onPick={(color) => set({ color })} />
          </Section>

          <Section title="TRAIL">
            <Picker
              label="STYLE"
              value={TRAIL_LABEL[ship.trail.glyph]}
              onStep={(s) => setTrail({ glyph: next(TRAIL_GLYPHS, ship.trail.glyph, s) })}
            />
            <Picker
              label="LENGTH"
              value={LENGTH_LABEL[ship.trail.length]}
              onStep={(s) => setTrail({ length: next([0, 1, 2] as const, ship.trail.length, s) })}
            />
            <Swatches
              label="Trail colour"
              value={ship.trail.color}
              onPick={(color) => setTrail({ color })}
            />
          </Section>

          <div className={styles.done}>
            <PixelButton onClick={close} title="Back to flying (Esc)">
              DONE
            </PixelButton>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
