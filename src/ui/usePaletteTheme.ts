import { useEffect } from 'react';
import { useStore } from 'zustand';
import { samplePalette, type Rgb } from '../renderer/palette/lut';
import { PALETTES } from '../renderer/palette/palettes';
import { settingsStore } from '../state/settings';

const css = ([r, g, b]: Rgb, alpha = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;

/** Re-colours the UI (CSS custom properties on :root) from the active palette. */
export function usePaletteTheme(): void {
  const paletteId = useStore(settingsStore, (s) => s.palette);
  useEffect(() => {
    const p = PALETTES[paletteId];
    const root = document.documentElement.style;
    root.setProperty('--ink', css(samplePalette(p, 0.84)));
    root.setProperty('--ink-bright', css(samplePalette(p, 0.97)));
    root.setProperty('--ink-dim', css(samplePalette(p, 0.42)));
    root.setProperty('--accent', css(samplePalette(p, 0.62)));
    root.setProperty('--glow', css(samplePalette(p, 0.6), 0.55));
    root.setProperty('--bg', p.background);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.background);
  }, [paletteId]);
}
