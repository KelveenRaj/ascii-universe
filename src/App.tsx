import { useEffect } from 'react';
import { useStore } from 'zustand';
import styles from '@/App.module.css';
import { EngineCanvas } from '@/engine/EngineCanvas';
import { navigationStore, startHashSync } from '@/state/navigation';
import { startProfileAutosave } from '@/state/profile';
import { settingsStore } from '@/state/settings';
import { BootScreen } from '@/ui/BootScreen';
import { InfoDock, Notice } from '@/ui/Dock';
import { FlightHud } from '@/ui/FlightHud';
import { Hangar } from '@/ui/Hangar';
import { HelpOverlay } from '@/ui/HelpOverlay';
import { KeyHint, StatusLine, TopBar } from '@/ui/Hud';
import { InfoPanel } from '@/ui/InfoPanel';
import { Minimap } from '@/ui/Minimap';
import { Onboarding } from '@/ui/Onboarding';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { SignalLost } from '@/ui/SignalLost';
import { TextExport } from '@/ui/TextExport';
import { useGlobalKeys } from '@/ui/useGlobalKeys';
import { usePaletteTheme } from '@/ui/usePaletteTheme';

/**
 * Two modes share one screen: infographics (warp between the Milky Way, Sgr A* and the Solar
 * System, read about what you see) and exploration (fly your own ship; contact with a real body
 * brings up its card). The map top right and the card top left serve both; tours and sharing
 * sit bottom right.
 */
export default function App() {
  usePaletteTheme();
  useGlobalKeys();
  useEffect(() => startHashSync(), []);
  useEffect(() => startProfileAutosave(), []);
  const hud = useStore(settingsStore, (s) => s.hud);
  const world = useStore(navigationStore, (s) => s.world);

  return (
    <main className={styles.app}>
      <EngineCanvas />
      {hud && !world && <StatusLine />}
      {!world && <KeyHint />}
      <InfoPanel />
      <FlightHud />
      <Hangar />
      <Onboarding />
      <Minimap />
      <InfoDock />
      <Notice />
      <TopBar />
      <SettingsPanel />
      <HelpOverlay />
      <TextExport />
      <SignalLost />
      <BootScreen />
    </main>
  );
}
