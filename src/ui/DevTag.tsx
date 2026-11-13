import { useStore } from 'zustand';
import { settingsStore } from '../state/settings';
import { statsStore } from '../state/stats';

/** Temporary corner readout until the real HUD lands in M5. Re-renders ~4×/s at most. */
export function DevTag() {
  const fps = useStore(statsStore, (s) => s.fps);
  const distance = useStore(statsStore, (s) => s.distance);
  const inclination = useStore(statsStore, (s) => s.inclination);
  const w = useStore(statsStore, (s) => s.sceneWidth);
  const h = useStore(statsStore, (s) => s.sceneHeight);
  const view = useStore(settingsStore, (s) => s.debugView);
  const paused = useStore(settingsStore, (s) => s.paused);

  return (
    <div className="dev-tag" aria-hidden="true">
      <div>ASCII UNIVERSE · M1</div>
      <div>
        {fps} FPS · {w}×{h}
      </div>
      <div>
        DIST {distance.toFixed(1)} · INC {inclination.toFixed(0)}°
      </div>
      <div>
        VIEW {view.toUpperCase()}
        {paused ? ' · PAUSED' : ''}
      </div>
      <div className="dev-tag-hint">DRAG · WHEEL · 1/2/3 · V · SPACE</div>
    </div>
  );
}
