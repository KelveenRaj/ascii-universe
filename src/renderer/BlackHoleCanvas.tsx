import { useEffect, useRef, useState } from 'react';
import styles from '@/renderer/BlackHoleCanvas.module.css';
import { Engine } from '@/renderer/Engine';

/**
 * The only component that touches WebGL. It mounts a canvas, hands it to the Engine and disposes the
 * Engine on unmount. It never re-renders because of the render loop.
 */
export function BlackHoleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: Engine | null = null;
    try {
      engine = new Engine(canvas);
    } catch (err) {
      console.error(err);
      // Deferred so we don't set state synchronously inside the effect body.
      queueMicrotask(() =>
        setError(
          'WebGL 2 is not available. Try a recent desktop browser with hardware acceleration.',
        ),
      );
    }
    return () => engine?.dispose();
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} />
      {error && (
        <div className={styles.fatal} role="alert">
          <p>NO SIGNAL</p>
          <p>{error}</p>
        </div>
      )}
    </>
  );
}
