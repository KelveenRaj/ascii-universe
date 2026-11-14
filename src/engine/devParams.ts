import { DEBUG_VIEWS, settingsStore, type DebugView } from '@/state/settings';
import type { CameraController } from '@/engine/camera/CameraController';
import { RAMPS, type RampId } from '@/engine/display/glyphs/ramps';
import { PALETTES, type PaletteId } from '@/engine/display/palette/palettes';

/**
 * Dev-only URL params for reproducible screenshots (the visual tests in e2e/ rely on them), e.g.
 * ?preset=eht&view=redshift&dist=20&elev=10&yaw=0&roll=0&t=12&ramp=blocks&palette=green&scale=2
 * &ascii=0&ss=1&crt=0&bloom=0&mask=1
 *
 * Applies camera and settings overrides, and returns the frozen scene time from `t` (or null).
 */
export function applyDevQueryParams(controller: CameraController): number | null {
  const q = new URLSearchParams(window.location.search);
  const s = settingsStore.getState();
  const preset = q.get('preset');
  if (preset) controller.setPreset(preset, true); // ignored if the scene has no such preset
  const view = q.get('view');
  if (view && (DEBUG_VIEWS as readonly string[]).includes(view)) {
    s.set('debugView', view as DebugView);
  }
  const goal = controller.goal;
  const deg = (name: string) => {
    const v = q.get(name);
    return v === null ? null : (Number(v) * Math.PI) / 180;
  };
  const dist = Number(q.get('dist'));
  if (dist > 0) goal.distance = dist;
  goal.elevation = deg('elev') ?? goal.elevation;
  goal.yaw = deg('yaw') ?? goal.yaw;
  goal.roll = deg('roll') ?? goal.roll;
  controller.snap();
  const ramp = q.get('ramp');
  if (ramp && ramp in RAMPS) s.set('ramp', ramp as RampId);
  const palette = q.get('palette');
  if (palette && palette in PALETTES) s.set('palette', palette as PaletteId);
  const scale = Number(q.get('scale'));
  if (scale >= 1) s.set('glyphScale', scale);
  if (q.get('ascii') === '0') s.set('ascii', false);
  if (q.get('ss') === '1') s.set('supersample', 1);
  if (q.get('crt') === '0') s.set('crt', false);
  if (q.get('bloom') === '0') s.set('bloom', false);
  if (q.get('mask') === '1') s.set('phosphorMask', true);
  const t = q.get('t');
  return t === null ? null : Number(t);
}
