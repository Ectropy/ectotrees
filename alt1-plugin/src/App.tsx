import { useState, useRef, useEffect } from 'react';
import { useScoutSession } from './hooks/useScoutSession';
import { useAlt1 } from './hooks/useAlt1';
import { SessionPanel } from './components/SessionPanel';
import { WorldInput } from './components/WorldInput';
import { ReportForm } from './components/ReportForm';
import { TooltipProvider } from './components/ui/tooltip';
import { DebugPanel } from './components/DebugPanel';

type StatusKind = 'ok' | 'warn' | 'error' | '';

const STATUS_DURATIONS: Record<StatusKind, number> = {
  ok: 3000,
  warn: 12000,
  error: 15000,
  '': 0,
};

export function App() {
  const { isAlt1, hasPixel, hasGameState, scanWorld, scanDialog } = useAlt1();
  const {
    status, code, clientCount, error, isPaired,
    session, createSession, joinSession, leaveSession, sendMutation, dismissError,
    submitPairToken, unpair,
  } = useScoutSession();

  // Form state
  const [world, setWorld] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [hint, setHint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Unified status message state
  const [statusMsg, setStatusMsg] = useState('');
  const [statusKind, setStatusKind] = useState<StatusKind>('');
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showStatus(message: string, kind: StatusKind = '') {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMsg(message);
    setStatusKind(kind);
    const duration = STATUS_DURATIONS[kind];
    if (duration > 0) {
      statusTimerRef.current = setTimeout(() => {
        setStatusMsg('');
        setStatusKind('');
        dismissError();
      }, duration);
    }
  }

  function clearStatus() {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMsg('');
    setStatusKind('');
    dismissError();
  }

  // Sync session errors into the shared status line
  useEffect(() => {
    if (error) showStatus(error, 'error');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Not in Alt1 — show install prompt
  if (!isAlt1) {
    const configUrl = new URL('./appconfig.json', window.location.href).href;
    const installHref = `alt1://addapp/${configUrl}`;
    return (
      <div className="flex items-center justify-center min-h-screen p-6 text-center">
        <div>
          <h1 className="text-lg font-bold mb-2.5">Ectotrees Scout</h1>
          <p className="text-muted-foreground mb-4">This app must be opened inside Alt1 Toolkit.</p>
          <a
            href={installHref}
            className="inline-block px-5 py-2 bg-primary text-primary-foreground rounded font-semibold text-[13px] no-underline hover:opacity-90"
          >
            Add to Alt1
          </a>
        </div>
      </div>
    );
  }

  // Alt1 but missing permissions
  if (!hasPixel && !hasGameState) {
    return (
      <div className="flex flex-col min-h-screen">
        <header className="bg-[#111116] px-3 py-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase border-b border-border select-none">
          Ectotrees Scout
        </header>
        <div className="px-3 py-4 text-sm text-warning">
          Grant pixel and/or gamestate permissions in Alt1 settings to use this app.
        </div>
      </div>
    );
  }

  // Helpers
  function getWorldId(): number | null {
    const v = parseInt(world.trim(), 10);
    return Number.isFinite(v) && v >= 1 && v <= 137 ? v : null;
  }

  function getTotalMs(): number {
    const h = parseInt(hours || '0', 10) || 0;
    const m = parseInt(minutes || '0', 10) || 0;
    return (h * 60 + m) * 60_000;
  }

  const canSubmit = getWorldId() !== null && getTotalMs() > 0 && status === 'connected' && !submitting;

  // Handlers
  function handleScanWorld() {
    if (!hasPixel && !hasGameState) {
      showStatus('No pixel/gamestate permission.', 'error');
      return;
    }
    showStatus('Scanning...');
    const result = scanWorld();
    if (result) {
      setWorld(String(result.world));
      setAutoDetected(true);
      showStatus(`World ${result.world} detected (via Alt1 gamestate).`, 'ok');
    } else {
      setAutoDetected(false);
      showStatus('Could not detect world — make sure you are logged in (not in lobby).', 'warn');
    }
  }

  function handleScanDialog() {
    if (!hasPixel) {
      showStatus('Alt1 pixel permission required to scan.', 'error');
      return;
    }
    showStatus('Scanning...');
    const result = scanDialog();
    if (!result) {
      showStatus('No dialog found — open the Spirit Tree chat first.', 'warn');
      return;
    }

    const detected: string[] = [];
    if (result.hours > 0 || result.minutes > 0) {
      setHours(String(result.hours));
      setMinutes(String(result.minutes));
      detected.push(`${result.hours}h ${result.minutes}m`);
    }
    if (result.hint) {
      setHint(result.hint);
      const truncated = result.hint.length > 40 ? result.hint.slice(0, 40) + '...' : result.hint;
      detected.push(`"${truncated}"`);
    }

    if (detected.length > 0) {
      showStatus(`Detected: ${detected.join(' · ')}`, 'ok');
    } else {
      const snippet = result.rawText.slice(0, 80).replace(/\n/g, ' ');
      showStatus(`Found dialog but no timer/hint: "${snippet}"`, 'warn');
    }
  }

  function handleSubmit() {
    const worldId = getWorldId();
    const msFromNow = getTotalMs();
    if (!worldId || msFromNow <= 0 || status === 'disconnected') return;

    const hintText = hint.trim().slice(0, 200);

    setSubmitting(true);
    submittingRef.current = true;
    showStatus('Submitting...');

    const unsubAck = session.on('ack', () => {
      unsubAck();
      unsubStatus();
      setSubmitting(false);
      submittingRef.current = false;
      showStatus('Submitted!', 'ok');
      setWorld('');
      setAutoDetected(false);
      setHours('');
      setMinutes('');
      setHint('');
    });

    const unsubStatus = session.on('statusChange', (s) => {
      if (s === 'disconnected' && submittingRef.current) {
        unsubStatus();
        unsubAck();
        setSubmitting(false);
        submittingRef.current = false;
        showStatus('Disconnected before submit was confirmed.', 'error');
      }
    });

    sendMutation({
      type: 'setSpawnTimer',
      worldId,
      msFromNow,
      treeInfo: hintText ? { treeHint: hintText } : undefined,
    });
  }

  function handleClear() {
    setHours('');
    setMinutes('');
    setHint('');
    setAutoDetected(false);
    clearStatus();
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-screen">
        <header className="bg-[#111116] px-3 py-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase border-b border-border select-none">
          Ectotrees Scout
        </header>

        <SessionPanel
          status={status}
          code={code}
          clientCount={clientCount}
          isPaired={isPaired}
          onJoin={joinSession}
          onCreate={createSession}
          onLeave={leaveSession}
          onSubmitPairToken={submitPairToken}
          onUnpair={unpair}
          onError={(msg) => showStatus(msg, 'error')}
        />

        <hr className="border-t border-border" />

        <WorldInput
          world={world}
          autoDetected={autoDetected}
          hasPixel={hasPixel}
          onChange={(v) => { setWorld(v); setAutoDetected(false); }}
          onScan={handleScanWorld}
        />

        <hr className="border-t border-border" />

        <ReportForm
          hours={hours}
          minutes={minutes}
          hint={hint}
          statusMsg={statusMsg}
          statusKind={statusKind}
          hasPixel={hasPixel}
          canSubmit={canSubmit}
          onHoursChange={setHours}
          onMinutesChange={setMinutes}
          onHintChange={setHint}
          onScanDialog={handleScanDialog}
          onSubmit={handleSubmit}
          onClear={handleClear}
        />

        {import.meta.env.MODE === 'development' && <DebugPanel />}
      </div>
    </TooltipProvider>
  );
}
