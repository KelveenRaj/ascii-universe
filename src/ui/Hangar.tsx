import { useEffect, useId, useRef } from 'react';
import { useStore } from 'zustand';
import { TEXT_SWATCHES } from '@/engine/display/TextLayer';
import { track } from '@/profile/EventSink';
import { profileStore } from '@/state/profile';
import { worldStore } from '@/state/world';
import commonStyles from '@/ui/common.module.css';
import { PanelHeader, PixelButton, Section } from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/Hangar.module.css';
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
import { ENGINE_LABELS, HULL_LABELS, WING_LABELS } from '@/world/ship/model';

const HEX = Object.fromEntries(TEXT_SWATCHES.map((s) => [s.id, s.hex])) as Record<
  ShipColorId,
  string
>;

const TRAIL_LABEL = { dots: 'DOTS', dashes: 'DASHES', stars: 'STARS', sparks: 'SPARKS' };
const LENGTH_LABEL = ['OFF', 'SHORT', 'LONG'];

const next = <T,>(list: readonly T[], v: T, step: 1 | -1) =>
  list[(list.indexOf(v) + step + list.length) % list.length];

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
 * The hangar: design your ship, looking at the real thing. A panel down the right (a sheet along
 * the bottom on a tall screen) while the flight is parked and the camera circles your ship in the
 * space that's left (WorldHost's showroom). Hull, wings and engine, a colour, a name, and the trail
 * it leaves. Hull, wings and engine, a colour, a name, and the trail it leaves.
 * Every change is saved to your pilot profile straight away and shows on the ship in flight.
 */
export function Hangar() {
  const open = useStore(worldStore, (s) => s.hangarOpen);
  const ship = useStore(profileStore, (s) => s.profile?.ship ?? DEFAULT_SHIP);
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();

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
    ref.current?.focus();
    return save;
  }, [open]);

  if (!open) return null;
  const close = () => worldStore.setState({ hangarOpen: false });
  const set = (change: Partial<ShipDesign>) =>
    profileStore.getState().update((p) => ({ ...p, ship: { ...p.ship, ...change } }));
  const setTrail = (change: Partial<ShipDesign['trail']>) =>
    set({ trail: { ...ship.trail, ...change } });

  return (
    <aside
      ref={ref}
      className={cx(commonStyles.frame, styles.hangar)}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-ui
    >
      <PanelHeader title="HANGAR" titleId={titleId} onClose={close} />
      <div className={styles.body} data-testid="hangar">
        <div className={styles.left}>
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
              value={HULL_LABELS[ship.hull]}
              onStep={(s) => set({ hull: next(HULLS, ship.hull, s) })}
            />
            <Picker
              label="WINGS"
              value={WING_LABELS[ship.wings]}
              onStep={(s) => set({ wings: next(WINGS, ship.wings, s) })}
            />
            <Picker
              label="ENGINE"
              value={ENGINE_LABELS[ship.engine]}
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
    </aside>
  );
}
