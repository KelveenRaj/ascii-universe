import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { uiStore } from '@/state/ui';
import { PixelButton } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import styles from '@/ui/TextExport.module.css';

/** Monospace glyphs are about 0.6em wide; used to fit the preview to the dialog width. */
const MONO_ASPECT = 0.6;
/** Horizontal space taken by the dialog border, padding and screen margin. */
const DIALOG_SIDE_PX = 96;

async function copyToClipboard(text: string, fallbackEl: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // no clipboard permission (or insecure context): select the text and use the legacy command
    if (!fallbackEl) return false;
    const range = document.createRange();
    range.selectNodeContents(fallbackEl);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const ok = document.execCommand('copy');
    selection?.removeAllRanges();
    return ok;
  }
}

function download(text: string, cols: number, rows: number): void {
  const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `black-hole-${cols}x${rows}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Dialog showing the captured frame as text, with copy and download. Opened with C. */
export function TextExport() {
  const text = useStore(uiStore, (s) => s.textExport);
  const preRef = useRef<HTMLPreElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    if (text === null) return;
    // text is taller than the screen grid; start the preview on the middle, where the hole is
    const preview = previewRef.current;
    if (preview) preview.scrollTop = (preview.scrollHeight - preview.clientHeight) / 2;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      setStatus('idle');
    };
  }, [text]);

  if (text === null) return null;
  const lines = text.split('\n');
  const cols = Math.max(1, ...lines.map((l) => l.length));
  const rows = lines.length;
  // fit the width (glyphs are ~0.6em wide); text is taller than the screen grid, so it scrolls
  const fitWidth = (Math.min(viewportWidth, 1460) - DIALOG_SIDE_PX) / (cols * MONO_ASPECT);
  const fontSize = Math.max(3, Math.min(12, fitWidth));

  return (
    <Dialog
      title="COPY AS TEXT"
      onClose={() => uiStore.getState().setTextExport(null)}
      className={styles.dialog}
    >
      <div ref={previewRef} className={styles.preview}>
        <pre ref={preRef} style={{ fontSize: `${fontSize}px` }}>
          {text}
        </pre>
      </div>
      <footer className={styles.actions}>
        <span className={styles.info}>
          {cols}×{rows} CHARS
        </span>
        <PixelButton
          onClick={() =>
            void copyToClipboard(text, preRef.current).then((ok) =>
              setStatus(ok ? 'copied' : 'failed'),
            )
          }
        >
          {status === 'copied' ? 'COPIED!' : status === 'failed' ? 'COPY FAILED' : 'COPY'}
        </PixelButton>
        <PixelButton onClick={() => download(text, cols, rows)}>DOWNLOAD .TXT</PixelButton>
      </footer>
    </Dialog>
  );
}
