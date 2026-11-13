import { useEffect } from 'react';
import { settingsStore } from '../state/settings';
import { uiStore } from '../state/ui';

const isTextField = (t: EventTarget | null) =>
  t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'range'
    ? true
    : t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * UI-level shortcuts: Tab or ` opens/closes settings, ? help, H the HUD, Esc closes overlays.
 * Inside the settings panel, Tab keeps its normal job of moving focus between controls.
 */
export function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return;
      const ui = uiStore.getState();
      const inPanel = e.target instanceof Element && e.target.closest('[data-ui]') !== null;

      if (e.key === 'Escape') {
        if (ui.helpOpen) ui.setHelpOpen(false);
        else if (ui.panelOpen) ui.setPanelOpen(false);
        return;
      }
      if (e.repeat) return;
      if (e.key === '`' || (e.key === 'Tab' && !inPanel && !e.shiftKey)) {
        e.preventDefault();
        ui.setPanelOpen(!ui.panelOpen);
      } else if (e.key === '?') {
        ui.setHelpOpen(!ui.helpOpen);
      } else if ((e.key === 'h' || e.key === 'H') && !inPanel) {
        const s = settingsStore.getState();
        s.set('hud', !s.hud);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
