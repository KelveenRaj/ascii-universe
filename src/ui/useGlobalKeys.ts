import { useEffect } from 'react';
import { navigationStore } from '@/state/navigation';
import { settingsStore } from '@/state/settings';
import { uiStore } from '@/state/ui';
import { onRenderShortcut } from '@/ui/renderShortcuts';

const isTextField = (t: EventTarget | null) =>
  t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'range'
    ? true
    : t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * UI-level shortcuts: Tab or ` opens/closes settings, ? help, H the HUD, Esc closes overlays.
 * Inside the settings panel, Tab keeps its normal job of moving focus between controls.
 * Also wires up the render shortcuts (see renderShortcuts.ts).
 */
export function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTextField(e.target)) return;
      const ui = uiStore.getState();
      const nav = navigationStore.getState();
      const inPanel = e.target instanceof Element && e.target.closest('[data-ui]') !== null;

      if (e.key === 'Escape') {
        if (ui.textExport !== null) ui.setTextExport(null);
        else if (ui.helpOpen) ui.setHelpOpen(false);
        else if (ui.panelOpen) ui.setPanelOpen(false);
        else if (nav.info) nav.setInfo(false);
        return;
      }
      if (e.repeat) return;
      if (e.key === '`' || (e.key === 'Tab' && !inPanel && !e.shiftKey)) {
        e.preventDefault();
        ui.setPanelOpen(!ui.panelOpen);
      } else if (e.key === '?') {
        ui.setHelpOpen(!ui.helpOpen);
      } else if ((e.key === 'i' || e.key === 'I') && !inPanel) {
        nav.setInfo(!nav.info);
      } else if ((e.key === 'h' || e.key === 'H') && !inPanel) {
        const s = settingsStore.getState();
        s.set('hud', !s.hud);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onRenderShortcut);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onRenderShortcut);
    };
  }, []);
}
