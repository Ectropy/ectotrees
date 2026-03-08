import { useState, useRef, useEffect } from 'react';
import { useScoutSession } from './hooks/useScoutSession';
import { useAlt1 } from './hooks/useAlt1';
import { StatusBanner } from './components/StatusBanner';
import { SessionPanel } from './components/SessionPanel';
import { LinkPanel } from './components/LinkPanel';
import { WorldInput } from './components/WorldInput';
import { ReportForm } from './components/ReportForm';

export function App() {
  const { isAlt1, hasPixel, hasGameState, scanWorld, scanDialog } = useAlt1();
  const {
    status, code, clientCount, error, isPaired, pairId,
    session, createSession, joinSession, leaveSession, sendMutation, dismissError,
    submitPairToken, unpair,
  } = useScoutSession();

  // Form state
  const [world, setWorld] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [hint, setHint] = useState('');
  const [scanStatus, setScanStatus] = useState('');
  const [scanStatusKind, setScanStatusKind] = useState<'ok' | 'warn' | 'error' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Banner state (session errors + transient messages)
  const [banner, setBanner] = useState<{ message: string; variant: 'error' | 'success' | 'warn' | '' } | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync session error to banner
  useEffect(() => {
    if (error) {
      setBanner({ message: error, variant: 'error' });
    }
  }, [error]);

  function showBanner(message: string, variant: 'error' | 'warn' | 'success' | '' = '', durationMs?: number) {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner({ message, variant });
    if (durationMs) {
      bannerTimerRef.current = setTimeout(() => setBanner(null), durationMs);
    }
  }

  function clearBanner() {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(null);
    dismissError();
  }

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
      setScanStatus('No pixel/gamestate permission.');
      setScanStatusKind('error');
      return;
    }
    setScanStatus('Scanning...');
    setScanStatusKind('');
    const result = scanWorld();
    if (result) {
      setWorld(String(result.world));
      setAutoDetected(true);
      const via = result.method === 'gamestate' ? 'via Alt1 gamestate' : 'via Friends List OCR';
      setScanStatus(`World ${result.world} detected (${via}).`);
      setScanStatusKind('ok');
    } else {
      setAutoDetected(false);
      setScanStatus('Could not detect world — make sure you are logged in (not in lobby).');
      setScanStatusKind('warn');
    }
  }

  function handleScanDialog() {
    if (!hasPixel) {
      setScanStatus('Alt1 pixel permission required to scan.');
      setScanStatusKind('error');
      return;
    }
    setScanStatus('Scanning...');
    setScanStatusKind('');
    const result = scanDialog();
    if (!result) {
      setScanStatus('No dialog found — open the Spirit Tree chat first.');
      setScanStatusKind('warn');
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
      setScanStatus(`Detected: ${detected.join(' · ')}`);
      setScanStatusKind('ok');
    } else {
      const snippet = result.rawText.slice(0, 80).replace(/\n/g, ' ');
      setScanStatus(`Found dialog but no timer/hint: "${snippet}"`);
      setScanStatusKind('warn');
    }
  }

  function handleSubmit() {
    const worldId = getWorldId();
    const msFromNow = getTotalMs();
    if (!worldId || msFromNow <= 0 || status === 'disconnected') return;

    const hintText = hint.trim().slice(0, 200);

    setSubmitting(true);
    submittingRef.current = true;
    setScanStatus('Submitting...');
    setScanStatusKind('');

    const unsubAck = session.on('ack', () => {
      unsubAck();
      unsubStatus();
      setSubmitting(false);
      submittingRef.current = false;
      setScanStatus('Submitted!');
      setScanStatusKind('ok');
      setWorld('');
      setAutoDetected(false);
      setHours('');
      setMinutes('');
      setHint('');
      setTimeout(() => {
        setScanStatus('');
        setScanStatusKind('');
      }, 3000);
    });

    const unsubStatus = session.on('statusChange', (s) => {
      if (s === 'disconnected' && submittingRef.current) {
        unsubStatus();
        unsubAck();
        setSubmitting(false);
        submittingRef.current = false;
        setScanStatus('Disconnected before submit was confirmed.');
        setScanStatusKind('error');
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
    setScanStatus('');
    setScanStatusKind('');
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-[#111116] px-3 py-2 text-[11px] font-bold tracking-wider text-muted-foreground uppercase border-b border-border select-none">
        Ectotrees Scout
      </header>

      <StatusBanner
        message={banner?.message ?? null}
        variant={banner?.variant ?? ''}
        onDismiss={clearBanner}
      />

      <SessionPanel
        status={status}
        code={code}
        clientCount={clientCount}
        onJoin={joinSession}
        onCreate={createSession}
        onLeave={leaveSession}
        onError={(msg) => showBanner(msg, 'error', 2500)}
      />

      {status === 'connected' && (
        <>
          <hr className="border-t border-border" />
          <LinkPanel
            isPaired={isPaired}
            pairId={pairId}
            sessionCode={code}
            onSubmitToken={submitPairToken}
            onUnpair={unpair}
          />
        </>
      )}

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
        scanStatus={scanStatus}
        scanStatusKind={scanStatusKind}
        hasPixel={hasPixel}
        canSubmit={canSubmit}
        onHoursChange={setHours}
        onMinutesChange={setMinutes}
        onHintChange={setHint}
        onScanDialog={handleScanDialog}
        onSubmit={handleSubmit}
        onClear={handleClear}
      />
    </div>
  );
}
