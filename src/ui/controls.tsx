import { useId, type ReactNode } from 'react';
import styles from '@/ui/controls.module.css';
import { cx } from '@/ui/cx';

/** Retro-styled form controls. All are native inputs underneath, so they work with keyboard and AT. */

export function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cx(styles.control, styles.toggle)}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className={styles.label}>{props.label}</span>
    </label>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
}) {
  const id = useId();
  const text = props.format ? props.format(props.value) : String(props.value);
  return (
    <div className={cx(styles.control, styles.slider, props.disabled && styles.disabled)}>
      <label htmlFor={id} className={styles.label}>
        {props.label}
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output htmlFor={id} className={styles.value}>
        {text}
      </output>
    </div>
  );
}

/** A toggle and its strength slider on one row (for effects). */
export function EffectRow(props: {
  label: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const off = props.disabled || !props.on;
  return (
    <div className={cx(styles.control, styles.effect, props.disabled && styles.disabled)}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={props.on}
          disabled={props.disabled}
          onChange={(e) => props.onToggle(e.target.checked)}
        />
        <span className={styles.label}>{props.label}</span>
      </label>
      <input
        id={id}
        type="range"
        aria-label={`${props.label} strength`}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={off}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output htmlFor={id} className={styles.value}>
        {Math.round((props.value / props.max) * 100)}%
      </output>
    </div>
  );
}

export function Select<T extends string>(props: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className={cx(styles.control, styles.select)}>
      <label htmlFor={id} className={styles.label}>
        {props.label}
      </label>
      <span className={styles.selectWrap}>
        <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

export function PixelButton(props: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  /** Full width of its container. */
  wide?: boolean;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}) {
  const { children, wide, ...rest } = props;
  return (
    <button type="button" className={cx(styles.button, wide && styles.wide)} {...rest}>
      {children}
    </button>
  );
}

/** Title bar with a close button, shared by the settings panel and dialogs. */
export function PanelHeader(props: { title: string; titleId?: string; onClose: () => void }) {
  return (
    <header className={styles.header}>
      <h2 id={props.titleId}>{props.title}</h2>
      <PixelButton onClick={props.onClose} title="Close (Esc)">
        X
      </PixelButton>
    </header>
  );
}

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className={styles.sectionTitle}>{props.title}</h3>
      {props.children}
    </section>
  );
}
