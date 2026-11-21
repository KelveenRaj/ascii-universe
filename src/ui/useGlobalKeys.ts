import { useEffect } from 'react';
import { navigationStore } from '@/state/navigation';
import { settingsStore } from '@/state/settings';
import { tourStore } from '@/state/tour';
import { worldStore } from '@/state/world';
import { uiStore } from '@/state/ui';
import { onRenderShortcut } from '@/ui/renderShortcuts';
import { needsCallsign } from '@/world/pilot';

/** Flying: shows or hides the card of the body you're in contact with. */
function toggleContactCard() {
  const contact = worldStore.getState().hud?.contact;
  if (!contact) return;
  const ui = uiStore.getState();
  ui.setContactHidden(ui.contactHidden === contact ? null : contact);
}

const isTextField = (t: EventTarget | null) =>
  t instanceof HTMLInputElement && t.type !== 'checkbox' && t.type !== 'range'
    ? true
    : t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

/**
 * UI-level shortcuts: Tab or ` opens/closes settings, ? help, H the status line, I the info card,
 * Backspace warps back out (or lands, when flying), Esc closes overlays (then lands, then hides the card).
 * Inside the settings panel, Tab keeps its normal job of moving focus between controls.
 * Also wires up the render shortcuts (see renderShortcuts.ts).
 */
export function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc never types anything, so it closes things even from a text box
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'Escape' && isTextField(e.target)) return;
      const ui = uiStore.getState();
      const nav = navigationStore.getState();
      const inPanel = e.target instanceof Element && e.target.closest('[data-ui]') !== null;

      if (e.key === 'Escape') {
        if (ui.textExport !== null) ui.setTextExport(null);
        else if (ui.helpOpen) ui.setHelpOpen(false);
        else if (ui.panelOpen) ui.setPanelOpen(false);
        else if (needsCallsign())
          return; // the new pilot dialog takes Esc as LAUNCH itself
        else if (worldStore.getState().hangarOpen) worldStore.setState({ hangarOpen: false });
        else if (tourStore.getState().tourId) tourStore.getState().exit();
        else if (nav.world) nav.setWorld(false);
        else if (nav.info) nav.setInfo(false);
        return;
      }
      if (e.repeat) return;
      if (e.key === '`' || (e.key === 'Tab' && !inPanel && !e.shiftKey)) {
        e.preventDefault();
        ui.setPanelOpen(!ui.panelOpen);
      } else if (e.key === '?') {
        ui.setHelpOpen(!ui.helpOpen);
      } else if (e.key === 'Backspace' && !inPanel) {
        e.preventDefault();
        // flying, it lands; otherwise it warps back out
        if (nav.world) nav.setWorld(false);
        else nav.goUp();
      } else if ((e.key === 'i' || e.key === 'I') && !inPanel) {
        if (nav.world) toggleContactCard();
        else nav.setInfo(!nav.info);
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
