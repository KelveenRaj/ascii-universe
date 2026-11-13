import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { uiStore } from '../state/ui';
import { PixelButton } from './controls';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth }));

  useEffect(() => {
    if (text === null) return;
    dialogRef.current?.focus();
    // text is taller than the screen grid; start the preview on the middle, where the hole is
    const preview = previewRef.current;
    if (preview) preview.scrollTop = (preview.scrollHeight - preview.clientHeight) / 2;
    const onResize = () => setViewport({ w: window.innerWidth });
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
  const fitWidth = (Math.min(viewport.w, 1460) - DIALOG_SIDE_PX) / (cols * MONO_ASPECT);
  const fontSize = Math.max(3, Math.min(12, fitWidth));
  const close = () => uiStore.getState().setTextExport(null);

  return (
    <div className="help-backdrop" onClick={close} data-ui>
      <div
        ref={dialogRef}
        className="text-export frame"
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-export-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <h2 id="text-export-title">COPY AS TEXT</h2>
          <PixelButton onClick={close} title="Close (Esc)">
            X
          </PixelButton>
        </header>
        <div ref={previewRef} className="text-export-preview">
          <pre ref={preRef} style={{ fontSize: `${fontSize}px` }}>
            {text}
          </pre>
        </div>
        <footer className="text-export-actions">
          <span className="text-export-info">
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
      </div>
    </div>
  );
}
