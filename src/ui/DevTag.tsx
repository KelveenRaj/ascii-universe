import { useStore } from 'zustand';
import { settingsStore } from '../state/settings';
import { statsStore } from '../state/stats';

/** Temporary corner readout until the real HUD lands in M5. Re-renders ~4×/s at most. */
export function DevTag() {
  const fps = useStore(statsStore, (s) => s.fps);
  const distance = useStore(statsStore, (s) => s.distance);
  const inclination = useStore(statsStore, (s) => s.inclination);
  const cols = useStore(statsStore, (s) => s.cols);
  const rows = useStore(statsStore, (s) => s.rows);
  const scale = useStore(statsStore, (s) => s.glyphScale);
  const w = useStore(statsStore, (s) => s.sceneWidth);
  const h = useStore(statsStore, (s) => s.sceneHeight);
  const view = useStore(settingsStore, (s) => s.debugView);
  const ramp = useStore(settingsStore, (s) => s.ramp);
  const palette = useStore(settingsStore, (s) => s.palette);
  const paused = useStore(settingsStore, (s) => s.paused);
  const attract = useStore(statsStore, (s) => s.attract);

  return (
    <div className="dev-tag" aria-hidden="true">
      <div>ASCII UNIVERSE · M3</div>
      <div>
        {fps} FPS · {cols > 0 ? `GRID ${cols}×${rows} @${scale}×` : `SMOOTH ${w}×${h}`}
      </div>
      <div>
        DIST {distance.toFixed(1)} · INC {inclination.toFixed(0)}°
      </div>
      <div>
        {view !== 'final' ? `VIEW ${view.toUpperCase()}` : `${ramp} · ${palette}`.toUpperCase()}
        {paused ? ' · PAUSED' : ''}
        {attract ? ' · ATTRACT' : ''}
      </div>
      <div className="dev-tag-hint">
        DRAG ORBIT · RIGHT-DRAG PAN · WHEEL ZOOM · WASD · Q/E ROLL · 1/2/3 · 0 RESET
        <br />[ ] SIZE · R RAMP · P PALETTE · G ASCII · V DEBUG · SPACE PAUSE
      </div>
    </div>
  );
}
