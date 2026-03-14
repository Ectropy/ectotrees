import { useState, useRef, useEffect } from 'react';
import worldsData from '../../src/data/worlds.json';

const VALID_WORLD_IDS = new Set(worldsData.worlds.map(w => w.id));
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

  // Auto-submit state
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  const [cloudCheck, setCloudCheck] = useState(false);
  const [blinkFrame, setBlinkFrame] = useState(false);
  const cloudCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSubmitRef = useRef<() => void>(() => {});

  // Auto-world state
  const [autoWorld, setAutoWorld] = useState(false);
  const [isWorldScanning, setIsWorldScanning] = useState(false);
  const worldScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWorldHopRef = useRef(0);

  // Auto-scan state
  const [autoScan, setAutoScan] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const scanningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Auto-world: poll every 5s, detect world hops via lastWorldHop timestamp
  useEffect(() => {
    if (!autoWorld || !hasGameState) return;
    // Seed with current value so we don't trigger on first poll
    if (typeof alt1 !== 'undefined') {
      lastWorldHopRef.current = alt1.lastWorldHop;
    }
    const id = setInterval(() => {
      if (typeof alt1 === 'undefined') return;
      const hopTs = alt1.lastWorldHop;
      if (hopTs !== lastWorldHopRef.current) {
        lastWorldHopRef.current = hopTs;
        const w = alt1.currentWorld;
        if (VALID_WORLD_IDS.has(w)) {
          setWorld(String(w));
          setAutoDetected(true);
          setIsWorldScanning(true);
          if (worldScanTimerRef.current) clearTimeout(worldScanTimerRef.current);
          worldScanTimerRef.current = setTimeout(() => setIsWorldScanning(false), 1500);
          showStatus(`World hop detected → W${w}`, 'ok');
        }
      }
    }, 5000);
    return () => {
      clearInterval(id);
      setIsWorldScanning(false);
      if (worldScanTimerRef.current) clearTimeout(worldScanTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoWorld, hasGameState]);

  // Auto-scan: on each RS click, retry scanning every 300ms between 150ms–800ms
  // after the click to catch the dialog as soon as it renders.
  const pendingClickAtRef = useRef(0);
  const prevLastActiveRef = useRef(0);
  useEffect(() => {
    if (!autoScan || !hasPixel) return;
    const id = setInterval(() => {
      if (typeof alt1 === 'undefined') return;
      const now = Date.now();
      const lastActive = alt1.rsLastActive;

      // Detect a click: rsLastActive dropped since last poll
      if (lastActive < prevLastActiveRef.current) {
        pendingClickAtRef.current = now;
        setIsScanning(true);
        if (scanningTimerRef.current) clearTimeout(scanningTimerRef.current);
        scanningTimerRef.current = setTimeout(() => setIsScanning(false), 800);
      }
      prevLastActiveRef.current = lastActive;

      if (pendingClickAtRef.current === 0) return;

      const sinceClick = now - pendingClickAtRef.current;
      // Too soon — dialog may not have rendered yet
      if (sinceClick < 150) return;
      // Window expired — give up
      if (sinceClick > 800) {
        pendingClickAtRef.current = 0;
        setIsScanning(false);
        return;
      }

      const result = scanDialog();
      if (result) {
        applyDialogScan(result, 'Auto-detected');
      }
    }, 300);
    return () => {
      clearInterval(id);
      setIsScanning(false);
      if (scanningTimerRef.current) clearTimeout(scanningTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan, hasPixel]);

  // Derived before early returns so effects can reference it
  const canSubmit = (() => {
    const wv = parseInt(world.trim(), 10);
    const h = parseInt(hours || '0', 10) || 0;
    const m = parseInt(minutes || '0', 10) || 0;
    return VALID_WORLD_IDS.has(wv) && (h * 60 + m) * 60_000 > 0 && status === 'connected' && !submitting;
  })();

  // Auto-submit requires a hint in addition to the base canSubmit conditions
  const canAutoSubmit = canSubmit && hint.trim().length > 0;

  const isCountingDown = autoCountdown !== null;

  // Start auto-submit countdown when all conditions are met
  useEffect(() => {
    if (autoSubmit && canAutoSubmit && autoCountdown === null && !submitting && !cloudCheck) {
      setAutoCountdown(10);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, canAutoSubmit, submitting, cloudCheck]);

  // Cancel countdown if fields become invalid for auto-submit
  useEffect(() => {
    if (!canAutoSubmit && autoCountdown !== null) {
      setAutoCountdown(null);
    }
  }, [canAutoSubmit, autoCountdown]);

  // Countdown tick → fire submit at 0
  useEffect(() => {
    if (autoCountdown === null) return;
    if (autoCountdown === 0) {
      setAutoCountdown(null);
      handleSubmitRef.current();
      return;
    }
    const id = setTimeout(() => setAutoCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [autoCountdown]);

  // Blink icon during countdown
  useEffect(() => {
    if (!isCountingDown) {
      setBlinkFrame(false);
      return;
    }
    const id = setInterval(() => setBlinkFrame(f => !f), 500);
    return () => clearInterval(id);
  }, [isCountingDown]);

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
    return VALID_WORLD_IDS.has(v) ? v : null;
  }

  function getTotalMs(): number {
    const h = parseInt(hours || '0', 10) || 0;
    const m = parseInt(minutes || '0', 10) || 0;
    return (h * 60 + m) * 60_000;
  }

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
      showStatus('Could not detect world. Right click on "Alt1 Toolkit," then enable "Show current world."', 'warn');
    }
  }

  function applyDialogScan(result: NonNullable<ReturnType<typeof scanDialog>>, prefix: string) {
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
      showStatus(`${prefix}: ${detected.join(' · ')}`, 'ok');
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
      showStatus('No intel found. Open dialog first.', 'warn');
      return;
    }

    applyDialogScan(result, 'Detected');
    if (result.hours === 0 && result.minutes === 0 && !result.hint) {
      const snippet = result.rawText.slice(0, 80).replace(/\n/g, ' ');
      showStatus(`Found dialog but no timer/hint: "${snippet}"`, 'warn');
    }
  }

  function handleSubmit() {
    const worldId = getWorldId();
    const msFromNow = getTotalMs();
    if (!worldId || msFromNow <= 0 || status === 'disconnected') return;

    setAutoCountdown(null);
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
      if (cloudCheckTimerRef.current) clearTimeout(cloudCheckTimerRef.current);
      setCloudCheck(true);
      cloudCheckTimerRef.current = setTimeout(() => setCloudCheck(false), 1500);
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
    setAutoCountdown(null);
    setWorld('');
    setHours('');
    setMinutes('');
    setHint('');
    setAutoDetected(false);
    clearStatus();
  }

  function handleAutoSubmitToggle() {
    if (cloudCheck) return;
    if (autoCountdown !== null) {
      setAutoCountdown(null);
      return;
    }
    setAutoSubmit(v => !v);
  }

  handleSubmitRef.current = handleSubmit;

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
          hasGameState={hasGameState}
          autoWorld={autoWorld}
          isWorldScanning={isWorldScanning}
          onChange={(v) => { setWorld(v); setAutoDetected(false); }}
          onScan={handleScanWorld}
          onAutoWorldToggle={() => {
            setAutoWorld(s => {
              if (!s) {
                // Test gamestate access before enabling
                const result = scanWorld();
                if (!result) {
                  showStatus('Could not detect world. Right click on "Alt1 Toolkit," then enable "Show current world."', 'warn');
                  return false;
                }
                setWorld(String(result.world));
                setAutoDetected(true);
                showStatus(`World ${result.world} detected. Auto-detect on.`, 'ok');
              } else {
                clearStatus();
              }
              return !s;
            });
          }}
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
          autoScan={autoScan}
          isScanning={isScanning}
          onScanDialog={handleScanDialog}
          onAutoScanToggle={() => {
            setAutoScan(s => {
              if (!s) showStatus('Auto-detect on. Clicks will trigger a scan. Keyboard interactions do not.');
              else clearStatus();
              return !s;
            });
          }}
          autoSubmit={autoSubmit}
          autoCountdown={autoCountdown}
          cloudCheck={cloudCheck}
          blinkFrame={blinkFrame}
          onAutoSubmitToggle={handleAutoSubmitToggle}
          onSubmit={handleSubmit}
          onClear={handleClear}
        />

        {import.meta.env.MODE === 'development' && <DebugPanel />}
      </div>
    </TooltipProvider>
  );
}
