import { useId, type ReactNode } from 'react';

/** Retro-styled form controls. All are native inputs underneath, so they work with keyboard and AT. */

export function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="ctl ctl-toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="ctl-label">{props.label}</span>
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
    <div className={`ctl ctl-slider${props.disabled ? ' is-disabled' : ''}`}>
      <label htmlFor={id} className="ctl-label">
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
      <output htmlFor={id} className="ctl-value">
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
    <div className={`ctl ctl-effect${props.disabled ? ' is-disabled' : ''}`}>
      <label className="ctl-toggle">
        <input
          type="checkbox"
          checked={props.on}
          disabled={props.disabled}
          onChange={(e) => props.onToggle(e.target.checked)}
        />
        <span className="ctl-label">{props.label}</span>
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
      <output htmlFor={id} className="ctl-value">
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
    <div className="ctl ctl-select">
      <label htmlFor={id} className="ctl-label">
        {props.label}
      </label>
      <span className="ctl-select-wrap">
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
  className?: string;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}) {
  const { children, className, ...rest } = props;
  return (
    <button type="button" className={`px-btn${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </button>
  );
}

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="panel-section">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}
