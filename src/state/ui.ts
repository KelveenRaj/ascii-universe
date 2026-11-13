import { createStore } from 'zustand/vanilla';

/** Transient UI state (not saved): which overlays are open. */
export interface UiState {
  panelOpen: boolean;
  helpOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
}

export const uiStore = createStore<UiState>()((set) => ({
  panelOpen: false,
  helpOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
}));
