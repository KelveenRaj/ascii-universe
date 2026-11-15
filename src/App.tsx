import { useEffect } from 'react';
import { useStore } from 'zustand';
import styles from '@/App.module.css';
import { EngineCanvas } from '@/engine/EngineCanvas';
import { navigationStore, startHashSync } from '@/state/navigation';
import { startProfileAutosave } from '@/state/profile';
import { settingsStore } from '@/state/settings';
import { BootScreen } from '@/ui/BootScreen';
import { GameOverlay } from '@/ui/GameOverlay';
import { HelpOverlay } from '@/ui/HelpOverlay';
import { Hud, KeyHint, TopBar } from '@/ui/Hud';
import { InfoPanel } from '@/ui/InfoPanel';
import { Navigator } from '@/ui/Navigator';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { SignalLost } from '@/ui/SignalLost';
import { TextExport } from '@/ui/TextExport';
import { useGlobalKeys } from '@/ui/useGlobalKeys';
import { WorldOverlay } from '@/ui/WorldOverlay';
import { Hangar } from '@/ui/Hangar';
import { usePaletteTheme } from '@/ui/usePaletteTheme';

export default function App() {
  usePaletteTheme();
  useGlobalKeys();
  useEffect(() => startHashSync(), []);
  useEffect(() => startProfileAutosave(), []);
  // the info card and a game's readout take the HUD's corner
  const hud = useStore(settingsStore, (s) => s.hud);
  const info = useStore(navigationStore, (s) => s.info);
  const game = useStore(navigationStore, (s) => s.game);
  const world = useStore(navigationStore, (s) => s.world);
  const explore = !info && !game && !world;

  return (
    <main className={styles.app}>
      <EngineCanvas />
      {hud && explore && <Hud />}
      {hud && explore && <KeyHint />}
      <InfoPanel />
      <GameOverlay />
      <WorldOverlay />
      <Hangar />
      {!game && !world && <Navigator />}
      <TopBar />
      <SettingsPanel />
      <HelpOverlay />
      <TextExport />
      <SignalLost />
      <BootScreen />
    </main>
  );
}
