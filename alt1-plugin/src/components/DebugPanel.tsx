/**
 * Dev-only debug panel for testing Alt1 API features.
 * Gated behind import.meta.env.DEV in App.tsx — tree-shaken in production.
 */

import { useState, useRef } from 'react';
import 'alt1/base';
import * as A1lib from 'alt1/base';
import DialogReader from 'alt1/dialog';
import ChatBoxReader from 'alt1/chatbox';
import TooltipReader from 'alt1/tooltip';

// ── Shared helpers ───────────────────────────────────────────────────────────

function Pre({ value }: { value: unknown }) {
  return (
    <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-tight text-green-300 whitespace-pre-wrap break-all">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ProbeBtn({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 pt-2">
      <div className="mb-1 text-[11px] font-bold text-amber-400">{title}</div>
      {children}
    </div>
  );
}

const noAlt1 = () => typeof alt1 === 'undefined';

// ── 1. Gamestate Properties ──────────────────────────────────────────────────

function GamestateProbe() {
  const [result, setResult] = useState<unknown>(null);

  function run() {
    if (noAlt1()) { setResult('alt1 not defined'); return; }
    setResult({
      currentWorld: alt1.currentWorld,
      lastWorldHop: alt1.lastWorldHop,
      rsPing: alt1.rsPing,
      rsFps: alt1.rsFps,
      rsActive: alt1.rsActive,
      rsLastActive: alt1.rsLastActive,
      mousePosition: alt1.mousePosition,
      'mousePosition (decoded)': {
        x: alt1.mousePosition >> 16,
        y: alt1.mousePosition & 0xFFFF,
      },
    });
  }

  return (
    <Section title="1. Gamestate Properties">
      <ProbeBtn onClick={run}>Read All</ProbeBtn>
      {result !== null && <Pre value={result} />}
    </Section>
  );
}

// ── 2. Gamestate Poll ────────────────────────────────────────────────────────

function GamestatePoll() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function toggle() {
    if (running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setRunning(false);
      return;
    }
    if (noAlt1()) { setLog(['alt1 not defined']); return; }
    setLog([]);
    setRunning(true);
    intervalRef.current = setInterval(() => {
      const now = new Date().toLocaleTimeString();
      const line = `${now}  world=${alt1.currentWorld}  lastHop=${alt1.lastWorldHop}`;
      setLog(prev => [...prev.slice(-50), line]);
    }, 1000);
  }

  return (
    <Section title="2. Gamestate Poll (1s)">
      <ProbeBtn onClick={toggle}>{running ? 'Stop' : 'Start'}</ProbeBtn>
      {log.length > 0 && <Pre value={log.join('\n')} />}
    </Section>
  );
}

// ── 3. Permissions & Status ──────────────────────────────────────────────────

function PermissionsProbe() {
  const [result, setResult] = useState<unknown>(null);

  function run() {
    if (noAlt1()) { setResult('alt1 not defined'); return; }
    setResult({
      permissionInstalled: alt1.permissionInstalled,
      permissionGameState: alt1.permissionGameState,
      permissionOverlay: alt1.permissionOverlay,
      permissionPixel: alt1.permissionPixel,
      rsLinked: alt1.rsLinked,
      version: alt1.version,
      versionint: alt1.versionint,
      captureMethod: alt1.captureMethod,
      captureInterval: alt1.captureInterval,
      maxtransfer: alt1.maxtransfer,
      rsWidth: alt1.rsWidth,
      rsHeight: alt1.rsHeight,
      rsScaling: alt1.rsScaling,
    });
  }

  return (
    <Section title="3. Permissions & Status">
      <ProbeBtn onClick={run}>Read All</ProbeBtn>
      {result !== null && <Pre value={result} />}
    </Section>
  );
}

// ── 4. OCR Test ──────────────────────────────────────────────────────────────

function OcrProbe() {
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [font, setFont] = useState('chat');
  const [result, setResult] = useState<unknown>(null);

  function pick() {
    if (noAlt1()) { setResult('alt1 not defined'); return; }
    const pos = alt1.mousePosition;
    setX(pos >> 16);
    setY(pos & 0xFFFF);
    setResult(`Picked: (${pos >> 16}, ${pos & 0xFFFF})`);
  }

  function read() {
    if (noAlt1()) { setResult('alt1 not defined'); return; }
    try {
      const capture = A1lib.captureHoldFullRs();
      const text = alt1.bindReadString(capture.handle, font, x, y) ?? '';
      setResult({ x, y, font, text: text || '(empty string)' });
    } catch (e) {
      setResult({ error: String(e) });
    }
  }

  return (
    <Section title="4. OCR Test">
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <ProbeBtn onClick={pick}>Pick Position</ProbeBtn>
        <label>
          x: <input type="number" value={x} onChange={e => setX(+e.target.value)}
            className="w-14 rounded bg-black/40 px-1 text-white" />
        </label>
        <label>
          y: <input type="number" value={y} onChange={e => setY(+e.target.value)}
            className="w-14 rounded bg-black/40 px-1 text-white" />
        </label>
        <select value={font} onChange={e => setFont(e.target.value)}
          className="rounded bg-black/40 px-1 text-white">
          <option value="chat">chat</option>
          <option value="chatmono">chatmono</option>
          <option value="xpcounter">xpcounter</option>
        </select>
        <ProbeBtn onClick={read}>Read</ProbeBtn>
      </div>
      {result !== null && <Pre value={result} />}
    </Section>
  );
}

// ── 5. ChatReader Test ───────────────────────────────────────────────────────

function ChatReaderProbe() {
  const [result, setResult] = useState<unknown>(null);

  function run() {
    if (noAlt1()) { setResult('alt1 not defined'); return; }
    try {
      const reader = new ChatBoxReader();
      const found = reader.find();
      if (!found) {
        setResult({ find: null, message: 'No chatbox detected' });
        return;
      }
      const pos = reader.pos;
      const lines = reader.read();
      setResult({ pos, lines });
    } catch (e) {
      setResult({ error: String(e) });
    }
  }

  return (
    <Section title="5. ChatReader">
      <ProbeBtn onClick={run}>Find & Read</ProbeBtn>
      {result !== null && <Pre value={result} />}
    </Section>
  );
}

// ── 6. DialogReader Test ─────────────────────────────────────────────────────

function DialogReaderProbe() {
  const [result, setResult] = useState<unknown>(null);

  function run() {
    if (noAlt1()) { setResult('alt1 not defined'); return; }
    try {
      const reader = new DialogReader();
      const found = reader.find();
      if (!found) {
        setResult({ find: false, message: 'No dialog detected' });
        return;
      }
      const readResult = reader.read();
      const readDialogResult = reader.readDialog(null, true);
      setResult({
        find: found,
        'read()': readResult,
        'readDialog(null, true)': readDialogResult,
      });
    } catch (e) {
      setResult({ error: String(e) });
    }
  }

  return (
    <Section title="6. DialogReader">
      <ProbeBtn onClick={run}>Find & Read</ProbeBtn>
      {result !== null && <Pre value={result} />}
    </Section>
  );
}

// ── 7. TooltipReader Test ────────────────────────────────────────────────────

function TooltipProbe() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const readerRef = useRef<TooltipReader | null>(null);

  function toggle() {
    if (running) {
      readerRef.current?.stopTrack();
      readerRef.current = null;
      setRunning(false);
      return;
    }
    if (noAlt1()) { setLog(['alt1 not defined']); return; }
    setLog([]);
    setRunning(true);
    const reader = new TooltipReader();
    readerRef.current = reader;
    reader.track((state: ReturnType<typeof TooltipReader.read>) => {
      if (!state) return;
      const now = new Date().toLocaleTimeString();
      const line = `${now}  ${JSON.stringify(state)}`;
      setLog(prev => [...prev.slice(-30), line]);
    }, 200);
  }

  return (
    <Section title="7. TooltipReader">
      <ProbeBtn onClick={toggle}>{running ? 'Stop' : 'Start Tracking'}</ProbeBtn>
      {log.length > 0 && <Pre value={log.join('\n')} />}
    </Section>
  );
}

// ── 8. Right-Click Menu Reader ────────────────────────────────────────────────

function RightClickProbe() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  function toggle() {
    if (running) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setRunning(false);
      return;
    }
    if (noAlt1()) { setLog(['alt1 not defined']); return; }
    setLog([]);
    setRunning(true);

    const handler = (e: { rectangle: { x: number; y: number; width: number; height: number } }) => {
      const now = new Date().toLocaleTimeString();
      const rect = e.rectangle;
      const lines: string[] = [`${now}  menu detected: x=${rect.x} y=${rect.y} w=${rect.width} h=${rect.height}`];

      try {
        const capture = A1lib.captureHold(rect.x, rect.y, rect.width, rect.height);
        if (capture) {
          // Try reading at each line position (RS3 menu lines are ~15px apart)
          const lineHeight = 15;
          const startY = 22; // skip "Choose Option" header
          for (let ly = startY; ly < rect.height - 5; ly += lineHeight) {
            const text = alt1.bindReadRightClickString(capture.handle, 5, ly) ?? '';
            if (text) {
              lines.push(`  y=${ly}: "${text}"`);
            }
          }
          if (lines.length === 1) {
            lines.push('  (no text read at any line position)');
          }
        }
      } catch (err) {
        lines.push(`  error: ${String(err)}`);
      }

      setLog(prev => [...prev.slice(-30), ...lines]);
    };

    A1lib.on('menudetected', handler);
    cleanupRef.current = () => A1lib.removeListener('menudetected', handler);
  }

  return (
    <Section title="8. Right-Click Menu (menudetected + bindReadRightClickString)">
      <div className="text-[10px] text-white/50 mb-1">Start, then right-click in RS.</div>
      <ProbeBtn onClick={toggle}>{running ? 'Stop' : 'Start Listening'}</ProbeBtn>
      {log.length > 0 && <Pre value={log.join('\n')} />}
    </Section>
  );
}

// ── 9. Screen Capture Test ───────────────────────────────────────────────────

function CaptureProbe() {
  const [result, setResult] = useState<unknown>(null);

  function run() {
    if (noAlt1()) { setResult('alt1 not defined'); return; }
    try {
      const capture = A1lib.captureHoldFullRs();
      const samplePixel = alt1.bindGetPixel(capture.handle, 0, 0);
      const [r, g, b] = A1lib.unmixColor(samplePixel);
      setResult({
        bindId: capture.handle,
        rsWidth: alt1.rsWidth,
        rsHeight: alt1.rsHeight,
        'pixel(0,0)': { raw: samplePixel, r, g, b },
      });
    } catch (e) {
      setResult({ error: String(e) });
    }
  }

  return (
    <Section title="9. Screen Capture">
      <ProbeBtn onClick={run}>Capture & Sample</ProbeBtn>
      {result !== null && <Pre value={result} />}
    </Section>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function DebugPanel() {
  return (
    <details className="mx-3 my-2 rounded border border-amber-500/30 bg-amber-950/20">
      <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-bold text-amber-400">
        🛠 Alt1 Debug Panel (dev only)
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <GamestateProbe />
        <GamestatePoll />
        <PermissionsProbe />
        <OcrProbe />
        <ChatReaderProbe />
        <DialogReaderProbe />
        <TooltipProbe />
        <RightClickProbe />
        <CaptureProbe />
      </div>
    </details>
  );
}
