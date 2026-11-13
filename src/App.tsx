import { useStore } from 'zustand';
import styles from '@/App.module.css';
import { BlackHoleCanvas } from '@/renderer/BlackHoleCanvas';
import { settingsStore } from '@/state/settings';
import { BootScreen } from '@/ui/BootScreen';
import { HelpOverlay } from '@/ui/HelpOverlay';
import { Hud, KeyHint, TopBar } from '@/ui/Hud';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { SignalLost } from '@/ui/SignalLost';
import { TextExport } from '@/ui/TextExport';
import { useGlobalKeys } from '@/ui/useGlobalKeys';
import { usePaletteTheme } from '@/ui/usePaletteTheme';

export default function App() {
  usePaletteTheme();
  useGlobalKeys();
  const hud = useStore(settingsStore, (s) => s.hud);

  return (
    <main className={styles.app}>
      <BlackHoleCanvas />
      {hud && <Hud />}
      {hud && <KeyHint />}
      <TopBar />
      <SettingsPanel />
      <HelpOverlay />
      <TextExport />
      <SignalLost />
      <BootScreen />
    </main>
  );
}
