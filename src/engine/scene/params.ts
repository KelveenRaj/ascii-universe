/**
 * Scene parameters: the knobs a scene exposes (disk speed, star density…). A scene declares a
 * schema; from it come the defaults, validation of saved values, and the scene's section in the
 * settings panel. Values are saved per scene (see state/sceneParams.ts).
 */

export interface NumberParam {
  kind: 'number';
  /** Settings-panel label, uppercase like the rest of the UI. */
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  /** Decimal places shown on the slider (default 1). */
  digits?: number;
  /** Saved and validated, but not shown in the panel (tweak in code or a future dev panel). */
  hidden?: boolean;
}

export interface BooleanParam {
  kind: 'boolean';
  label: string;
  default: boolean;
  hidden?: boolean;
}

export type Param = NumberParam | BooleanParam;
export type ParamSchema = Record<string, Param>;
export type ParamValue = number | boolean;

/** The value object a schema describes, e.g. { diskSpeed: number; showGrid: boolean }. */
export type ParamValues<S extends ParamSchema> = {
  [K in keyof S]: S[K] extends BooleanParam
    ? boolean
    : S[K] extends NumberParam
      ? number
      : ParamValue;
};

export function defaultParams<S extends ParamSchema>(schema: S): ParamValues<S> {
  const out: Record<string, ParamValue> = {};
  for (const [key, param] of Object.entries(schema)) out[key] = param.default;
  return out as ParamValues<S>;
}

/** Validates one value: numbers are clamped to range, wrong types and NaN/Infinity rejected. */
export function sanitizeParam(param: Param, value: unknown): ParamValue | undefined {
  if (param.kind === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(param.max, Math.max(param.min, value));
}

/**
 * Turns whatever was saved into a full, valid value object: unknown keys are dropped, invalid
 * values fall back to the default.
 */
export function sanitizeParams<S extends ParamSchema>(schema: S, raw: unknown): ParamValues<S> {
  const out = defaultParams(schema) as Record<string, ParamValue>;
  if (!raw || typeof raw !== 'object') return out as ParamValues<S>;
  const input = raw as Record<string, unknown>;
  for (const [key, param] of Object.entries(schema)) {
    const value = sanitizeParam(param, input[key]);
    if (value !== undefined) out[key] = value;
  }
  return out as ParamValues<S>;
}
