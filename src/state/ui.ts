import { createStore } from 'zustand/vanilla';

/** Transient UI state (not saved): which overlays are open. */
export interface UiState {
  panelOpen: boolean;
  helpOpen: boolean;
  /** Captured frame as text while the copy-as-text dialog is open, else null. */
  textExport: string | null;
  setPanelOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setTextExport: (text: string | null) => void;
}

export const uiStore = createStore<UiState>()((set) => ({
  panelOpen: false,
  helpOpen: false,
  textExport: null,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setTextExport: (textExport) => set({ textExport }),
}));
