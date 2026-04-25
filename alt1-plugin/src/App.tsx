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
    status, identityToken, error,
    memberName, memberRole,
    reconnectAttempt, reconnectAt,
    ackCount, leaveSession, sendMutation, dismissError,
    joinWithToken, reportWorld,
  } = useScoutSession();

  // Form state
  const [world, setWorld] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [hint, setHint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  type SubmittedValues = { world: string; hours: string; minutes: string; hint: string };
  const submittedValuesRef = useRef<SubmittedValues | null>(null);

  // Auto-submit state
  const [autoSubmit, setAutoSubmit] = useState(() => localStorage.getItem('scout_autoSubmit') === 'true');
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  const [cloudCheck, setCloudCheck] = useState(false);
  const [blinkFrame, setBlinkFrame] = useState(false);
  const cloudCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSubmitRef = useRef<() => void>(() => {});
  type PendingSubmit = { worldId: number; msFromNow: number; hintText: string };
  const pendingSubmitRef = useRef<PendingSubmit | null>(null);

  // Auto-world state
  const [autoWorld, setAutoWorld] = useState(() => localStorage.getItem('scout_autoWorld') === 'true');
  const [isWorldScanning, setIsWorldScanning] = useState(false);
  const worldScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWorldHopRef = useRef(0);

  // Auto-scan state
  const [autoScan, setAutoScan] = useState(() => localStorage.getItem('scout_autoScan') === 'true');
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


  // Handle server ACK — clears fields and shows success after a confirmed submission
  useEffect(() => {
    if (!submittingRef.current) return;
    const sv = submittedValuesRef.current;
    submittedValuesRef.current = null;
    setSubmitting(false);
    submittingRef.current = false;
    showStatus('Submitted!', 'ok');
    if (sv) {
      setWorld(w => (w.trim() === sv.world ? '' : w));
      setHours(v => (v === sv.hours ? '' : v));
      setMinutes(v => (v === sv.minutes ? '' : v));
      setHint(v => (v.trim().slice(0, 200) === sv.hint ? '' : v));
    }
    if (cloudCheckTimerRef.current) clearTimeout(cloudCheckTimerRef.current);
    setCloudCheck(true);
    cloudCheckTimerRef.current = setTimeout(() => setCloudCheck(false), 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ackCount]);

  // Handle disconnect while a submission is in flight
  useEffect(() => {
    if (status === 'disconnected' && submittingRef.current) {
      submittedValuesRef.current = null;
      setSubmitting(false);
      submittingRef.current = false;
      showStatus('Disconnected before submit was confirmed.', 'error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
          setIsWorldScanning(true);
          if (worldScanTimerRef.current) clearTimeout(worldScanTimerRef.current);
          worldScanTimerRef.current = setTimeout(() => setIsWorldScanning(false), 1500);
          showStatus(`World hop detected → W${w}`, 'ok');
          reportWorld(w);
        } else {
          reportWorld(null);
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
      const worldId = getWorldId();
      if (worldId !== null) {
        pendingSubmitRef.current = {
          worldId,
          msFromNow: getTotalMs(),
          hintText: hint.trim().slice(0, 200),
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAutoCountdown(10);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, canAutoSubmit, submitting, cloudCheck]);

  // Cancel countdown if fields become invalid for auto-submit. Paired with the
  // start effect above — both are imperative reactions to a derived condition
  // changing, which the new react-hooks/set-state-in-effect rule flags. Any
  // refactor that splits the lifecycle (derived display, per-input cancel) has
  // worse failure modes; keep both effects disabled together.
  useEffect(() => {
    if (!canAutoSubmit && autoCountdown !== null) {
      pendingSubmitRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoCountdown(null);
    }
  }, [canAutoSubmit, autoCountdown]);

  // Countdown tick → fire submit at 0
  useEffect(() => {
    if (autoCountdown === null) return;
    if (autoCountdown === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoCountdown(null);
      handleSubmitRef.current();
      return;
    }
    const id = setTimeout(() => setAutoCountdown(c => (c !== null ? c - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [autoCountdown]);

  // Blink icon during countdown. The stale blinkFrame value is harmless when not
  // counting down — the icon only renders inside `autoCountdown !== null`.
  useEffect(() => {
    if (!isCountingDown) return;
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
      showStatus(`World ${result.world} detected (via Alt1 gamestate).`, 'ok');
    } else {
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
    const pending = pendingSubmitRef.current;
    pendingSubmitRef.current = null;

    const worldId = pending?.worldId ?? getWorldId();
    const msFromNow = pending?.msFromNow ?? getTotalMs();
    const hintText = pending?.hintText ?? hint.trim().slice(0, 200);

    if (!worldId || msFromNow <= 0 || status === 'disconnected') return;

    setAutoCountdown(null);

    setSubmitting(true);
    submittingRef.current = true;
    showStatus('Submitting...');

    const h = Math.floor(msFromNow / 3_600_000);
    const m = Math.floor((msFromNow % 3_600_000) / 60_000);
    submittedValuesRef.current = {
      world: String(worldId),
      hours: h > 0 ? String(h) : '',
      minutes: m > 0 ? String(m) : '',
      hint: hintText,
    };

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
    clearStatus();
  }

  function handleAutoSubmitToggle() {
    if (cloudCheck) return;
    if (autoCountdown !== null) {
      setAutoCountdown(null);
      return;
    }
    setAutoSubmit(v => {
      const next = !v;
      localStorage.setItem('scout_autoSubmit', String(next));
      return next;
    });
  }

  handleSubmitRef.current = handleSubmit;

  return (
    <TooltipProvider>
      <div className="flex flex-col min-h-screen">
        <SessionPanel
          status={status}
          identityToken={identityToken}
          error={error}
          memberName={memberName}
          memberRole={memberRole}
          reconnectAttempt={reconnectAttempt}
          reconnectAt={reconnectAt}
          onLeave={leaveSession}
          onJoinWithToken={joinWithToken}
          onDismissError={dismissError}
        />

        <hr className="border-t border-border" />

        <WorldInput
          world={world}
          hasPixel={hasPixel}
          hasGameState={hasGameState}
          autoWorld={autoWorld}
          isWorldScanning={isWorldScanning}
          onChange={(v) => { setWorld(v); }}
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
                showStatus(`World ${result.world} detected. Auto-detect on.`, 'ok');
              } else {
                clearStatus();
              }
              const next = !s;
              localStorage.setItem('scout_autoWorld', String(next));
              return next;
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
              const next = !s;
              localStorage.setItem('scout_autoScan', String(next));
              return next;
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
