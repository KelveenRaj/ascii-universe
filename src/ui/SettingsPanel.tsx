import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { RAMP_IDS, RAMPS } from '@/engine/display/glyphs/ramps';
import { PALETTE_IDS, PALETTES } from '@/engine/display/palette/palettes';
import { sendCommand } from '@/state/commands';
import {
  NUMERIC_RANGES,
  QUALITY_LEVELS,
  QUALITY_STEPS,
  settingsStore,
  type Quality,
  type Settings,
} from '@/state/settings';
import { statsStore } from '@/state/stats';
import { uiStore } from '@/state/ui';
import commonStyles from '@/ui/common.module.css';
import {
  EffectRow,
  PanelHeader,
  PixelButton,
  Section,
  Select,
  Slider,
  Toggle,
} from '@/ui/controls';
import { cx } from '@/ui/cx';
import styles from '@/ui/SettingsPanel.module.css';
import { useActiveScene } from '@/ui/useActiveScene';

type SizeOption = 'auto' | '1' | '2' | '3' | '4' | 'custom';

const SIZE_OPTIONS: ReadonlyArray<{ value: SizeOption; label: string }> = [
  { value: 'auto', label: 'AUTO' },
  { value: '1', label: '1× (8 PX)' },
  { value: '2', label: '2× (16 PX)' },
  { value: '3', label: '3× (24 PX)' },
  { value: '4', label: '4× (32 PX)' },
  { value: 'custom', label: 'CUSTOM COLUMNS' },
];

const QUALITY_LABELS: Record<Quality, string> = {
  low: `LOW (${QUALITY_STEPS.low} STEPS)`,
  medium: `MEDIUM (${QUALITY_STEPS.medium})`,
  high: `HIGH (${QUALITY_STEPS.high})`,
  ultra: `ULTRA (${QUALITY_STEPS.ultra})`,
  auto: 'AUTO',
};

/** Hook returning a setting's value and a setter, re-rendering only when that value changes. */
function useSetting<K extends keyof Settings>(key: K): [Settings[K], (v: Settings[K]) => void] {
  const value = useStore(settingsStore, (s) => s[key]);
  return [value, (v) => settingsStore.getState().set(key, v)];
}

function NumberSlider(props: {
  label: string;
  k: keyof typeof NUMERIC_RANGES;
  digits?: number;
  disabled?: boolean;
}) {
  const [value, set] = useSetting(props.k);
  const r = NUMERIC_RANGES[props.k];
  return (
    <Slider
      label={props.label}
      value={value}
      min={r.min}
      max={r.max}
      step={r.step}
      onChange={set}
      format={(v) => v.toFixed(props.digits ?? 1)}
      disabled={props.disabled}
    />
  );
}

type EffectKey = 'curvature' | 'scanlines' | 'chromatic' | 'vignette' | 'phosphorMask' | 'flicker';
type AmountKey =
  | 'curvatureAmount'
  | 'scanlineStrength'
  | 'chromaticAmount'
  | 'vignetteStrength'
  | 'maskStrength'
  | 'flickerAmount';

function Effect(props: { label: string; flag: EffectKey; amount: AmountKey; disabled?: boolean }) {
  const [on, setOn] = useSetting(props.flag);
  const [value, setValue] = useSetting(props.amount);
  const r = NUMERIC_RANGES[props.amount];
  return (
    <EffectRow
      label={props.label}
      on={on}
      onToggle={setOn}
      value={value}
      min={r.min}
      max={r.max}
      step={r.step}
      onChange={setValue}
      disabled={props.disabled}
    />
  );
}

export function SettingsPanel() {
  const open = useStore(uiStore, (s) => s.panelOpen);
  const scene = useActiveScene();
  const panelRef = useRef<HTMLElement>(null);

  const [ascii, setAscii] = useSetting('ascii');
  const [glyphScale, setGlyphScale] = useSetting('glyphScale');
  const [columns, setColumns] = useSetting('columns');
  const [supersample, setSupersample] = useSetting('supersample');
  const [ramp, setRamp] = useSetting('ramp');
  const [palette, setPalette] = useSetting('palette');
  const [quality, setQuality] = useSetting('quality');
  const [paused, setPaused] = useSetting('paused');
  const [crt, setCrt] = useSetting('crt');
  const [bloom, setBloom] = useSetting('bloom');
  const [bloomStrength, setBloomStrength] = useSetting('bloomStrength');
  const [attract, setAttract] = useSetting('attractMode');
  const [hud, setHud] = useSetting('hud');

  // move focus into the panel when it opens, so keyboard users land in it
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const size: SizeOption =
    columns > 0 ? 'custom' : glyphScale === 0 ? 'auto' : (String(glyphScale) as SizeOption);
  const onSize = (v: SizeOption) => {
    if (v === 'custom') {
      const current = statsStore.getState().cols || 160;
      setColumns(Math.max(40, Math.round(current / 4) * 4));
    } else {
      setColumns(0);
      setGlyphScale(v === 'auto' ? 0 : Number(v));
    }
  };
  const colRange = NUMERIC_RANGES.columns;

  return (
    <aside
      id="settings-panel"
      ref={panelRef}
      className={cx(commonStyles.frame, styles.panel, open && styles.open)}
      aria-label="Settings"
      aria-hidden={!open}
      inert={!open}
      tabIndex={-1}
      data-ui
    >
      <PanelHeader title="SETTINGS" onClose={() => uiStore.getState().setPanelOpen(false)} />

      <div className={styles.body}>
        <Section title="DISPLAY">
          <Toggle label="ASCII MODE" checked={ascii} onChange={setAscii} />
          <Select label="GLYPH SIZE" value={size} options={SIZE_OPTIONS} onChange={onSize} />
          {size === 'custom' && (
            <Slider
              label="COLUMNS"
              value={columns}
              min={40}
              max={colRange.max}
              step={colRange.step}
              onChange={setColumns}
            />
          )}
          <Toggle
            label="2×2 SUPERSAMPLING"
            checked={supersample === 2}
            onChange={(on) => setSupersample(on ? 2 : 1)}
          />
          <Select
            label="CHARACTERS"
            value={ramp}
            options={RAMP_IDS.map((id) => ({ value: id, label: RAMPS[id].label.toUpperCase() }))}
            onChange={setRamp}
          />
          <Select
            label="PALETTE"
            value={palette}
            options={PALETTE_IDS.map((id) => ({
              value: id,
              label: PALETTES[id].label.toUpperCase(),
            }))}
            onChange={setPalette}
          />
          <NumberSlider label="EXPOSURE" k="exposure" />
          <PixelButton
            wide
            onClick={() => {
              uiStore.getState().setPanelOpen(false);
              sendCommand({ type: 'captureText' });
            }}
          >
            COPY FRAME AS TEXT (C)
          </PixelButton>
        </Section>

        <Section title="BLACK HOLE">
          <Select
            label="QUALITY"
            value={quality}
            options={QUALITY_LEVELS.map((q) => ({ value: q, label: QUALITY_LABELS[q] }))}
            onChange={setQuality}
          />
          <NumberSlider label="DISK SPEED" k="diskSpeed" />
          <NumberSlider label="BEAMING" k="beaming" />
          <NumberSlider label="STARS" k="starDensity" digits={2} />
          <Toggle label="PAUSE DISK" checked={paused} onChange={setPaused} />
        </Section>

        <Section title="CRT">
          <Toggle label="CRT TUBE" checked={crt} onChange={setCrt} />
          <Effect label="CURVE" flag="curvature" amount="curvatureAmount" disabled={!crt} />
          <Effect label="SCANLINES" flag="scanlines" amount="scanlineStrength" disabled={!crt} />
          <Effect label="ABERRATION" flag="chromatic" amount="chromaticAmount" disabled={!crt} />
          <Effect label="VIGNETTE" flag="vignette" amount="vignetteStrength" disabled={!crt} />
          <Effect label="PHOSPHOR" flag="phosphorMask" amount="maskStrength" disabled={!crt} />
          <Effect label="FLICKER" flag="flicker" amount="flickerAmount" disabled={!crt} />
          <EffectRow
            label="BLOOM"
            on={bloom}
            onToggle={setBloom}
            value={bloomStrength}
            min={NUMERIC_RANGES.bloomStrength.min}
            max={NUMERIC_RANGES.bloomStrength.max}
            step={NUMERIC_RANGES.bloomStrength.step}
            onChange={setBloomStrength}
          />
        </Section>

        <Section title="CAMERA">
          <div className={styles.buttonRow}>
            {scene.camera.presets.map((p) => (
              <PixelButton key={p.id} onClick={() => sendCommand({ type: 'preset', preset: p.id })}>
                {p.label}
              </PixelButton>
            ))}
          </div>
          <Toggle label="ATTRACT MODE" checked={attract} onChange={setAttract} />
          <Toggle label="SHOW HUD" checked={hud} onChange={setHud} />
        </Section>

        <PixelButton wide onClick={() => settingsStore.getState().reset()}>
          RESET ALL SETTINGS
        </PixelButton>
      </div>
    </aside>
  );
}
