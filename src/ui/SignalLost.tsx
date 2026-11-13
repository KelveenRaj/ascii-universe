import { useStore } from 'zustand';
import { statsStore } from '../state/stats';

/** Shown while the browser has taken the GPU context away (driver reset, too many tabs, …). */
export function SignalLost() {
  const lost = useStore(statsStore, (s) => s.signalLost);
  if (!lost) return null;
  return (
    <div className="signal-lost" role="alert">
      <p className="signal-lost-title">SIGNAL LOST</p>
      <p>GPU CONTEXT DROPPED · REACQUIRING</p>
      <p className="boot-cursor">_</p>
    </div>
  );
}
