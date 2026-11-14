import { useEffect } from 'react';
import { useStore } from 'zustand';
import { sampleRamp, type Rgb } from '@/engine/display/palette/lut';
import { PALETTES, resolveColors } from '@/engine/display/palette/palettes';
import { settingsStore } from '@/state/settings';
import { useActiveScene } from '@/ui/useActiveScene';

const css = ([r, g, b]: Rgb, alpha = 1) =>
  `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;

/**
 * Re-colours the UI (CSS custom properties on :root) from the active palette. Under natural colours
 * the UI takes the scene's first (main) material and its sky.
 */
export function usePaletteTheme(): void {
  const paletteId = useStore(settingsStore, (s) => s.palette);
  const scene = useActiveScene();
  useEffect(() => {
    const { ramps, sky } = resolveColors(PALETTES[paletteId], scene);
    const ramp = ramps[0];
    const root = document.documentElement.style;
    root.setProperty('--ink', css(sampleRamp(ramp, 0.84)));
    root.setProperty('--ink-bright', css(sampleRamp(ramp, 0.97)));
    root.setProperty('--ink-dim', css(sampleRamp(ramp, 0.42)));
    root.setProperty('--accent', css(sampleRamp(ramp, 0.62)));
    root.setProperty('--glow', css(sampleRamp(ramp, 0.6), 0.55));
    root.setProperty('--bg', sky.background);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sky.background);
  }, [paletteId, scene]);
}
