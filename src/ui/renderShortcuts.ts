import { isTypingTarget } from '@/engine/camera/InputManager';
import { RAMP_IDS } from '@/engine/display/glyphs/ramps';
import { MAX_GLYPH_SCALE } from '@/engine/display/grid';
import { PALETTE_IDS } from '@/engine/display/palette/palettes';
import { sendCommand } from '@/state/commands';
import { navigationStore } from '@/state/navigation';
import { settingsStore } from '@/state/settings';
import { statsStore } from '@/state/stats';

const cycle = <T>(list: readonly T[], current: T) =>
  list[(list.indexOf(current) + 1) % list.length];

/**
 * Single-key render shortcuts (V, Space, G, R, P, B, T, L, C, [ ]). They only change settings or send
 * commands, so they don't need the engine. Camera keys live in InputManager; overlay keys (Tab, H,
 * ?, Esc) in useGlobalKeys.
 */
export function onRenderShortcut(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTypingTarget(e.target)) return;
  const s = settingsStore.getState();
  switch (e.key.toLowerCase()) {
    case 'v':
      s.cycleDebugView();
      break;
    case ' ':
      // in a game, Space is the game's
      if (navigationStore.getState().game) break;
      e.preventDefault();
      s.togglePaused();
      break;
    case 'g':
      s.set('ascii', !s.ascii);
      break;
    case 'r':
      s.set('ramp', cycle(RAMP_IDS, s.ramp));
      break;
    case 'p':
      s.set('palette', cycle(PALETTE_IDS, s.palette));
      break;
    case 'b':
      s.set('bloom', !s.bloom);
      break;
    case 'l':
      s.set('labels', !s.labels);
      break;
    case 't':
      s.set('crt', !s.crt);
      break;
    case 'c':
      sendCommand({ type: 'captureText' });
      break;
    case '[':
    case ']': {
      // stats hold the glyph size actually on screen (0 when ASCII is off)
      const current = statsStore.getState().glyphScale || 1;
      const next = current + (e.key === ']' ? 1 : -1);
      s.set('columns', 0);
      s.set('glyphScale', Math.min(MAX_GLYPH_SCALE, Math.max(1, Math.round(next))));
      break;
    }
  }
}
