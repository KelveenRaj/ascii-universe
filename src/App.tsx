import { useEffect } from 'react';
import { useStore } from 'zustand';
import styles from '@/App.module.css';
import { EngineCanvas } from '@/engine/EngineCanvas';
import { navigationStore, startHashSync } from '@/state/navigation';
import { settingsStore } from '@/state/settings';
import { BootScreen } from '@/ui/BootScreen';
import { HelpOverlay } from '@/ui/HelpOverlay';
import { Hud, KeyHint, TopBar } from '@/ui/Hud';
import { InfoPanel } from '@/ui/InfoPanel';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { SignalLost } from '@/ui/SignalLost';
import { TextExport } from '@/ui/TextExport';
import { useGlobalKeys } from '@/ui/useGlobalKeys';
import { usePaletteTheme } from '@/ui/usePaletteTheme';

export default function App() {
  usePaletteTheme();
  useGlobalKeys();
  useEffect(() => startHashSync(), []);
  // the info card takes the HUD's corner
  const hud = useStore(settingsStore, (s) => s.hud);
  const info = useStore(navigationStore, (s) => s.info);

  return (
    <main className={styles.app}>
      <EngineCanvas />
      {hud && !info && <Hud />}
      {hud && !info && <KeyHint />}
      <InfoPanel />
      <TopBar />
      <SettingsPanel />
      <HelpOverlay />
      <TextExport />
      <SignalLost />
      <BootScreen />
    </main>
  );
}
