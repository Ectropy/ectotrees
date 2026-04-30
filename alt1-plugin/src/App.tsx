import { useState, useRef, useEffect } from 'react';
import worldsData from '../../src/data/worlds.json';

const VALID_WORLD_IDS = new Set(worldsData.worlds.map(w => w.id));
import { hintForLocation, locationsForHint, resolveExactLocation } from '@shared/hints';
import { useScoutSession } from './hooks/useScoutSession';
import { useAlt1 } from './hooks/useAlt1';
import { SessionPanel } from './components/SessionPanel';
import { WorldInput } from './components/WorldInput';
import { ModeNav } from './components/ModeNav';
import { ReportForm } from './components/ReportForm';
import { PostSpawnForm } from './components/PostSpawnForm';
import { DeadForm } from './components/DeadForm';
import { TooltipProvider } from './components/ui/tooltip';
import { DebugPanel } from './components/DebugPanel';
import type { TreeType } from '@shared/types';
import type { ClientMessage } from '@shared/protocol';

type Mode = 'prespawn' | 'postspawn' | 'dead';

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
    worldStates,
  } = useScoutSession();

  // Form state
  const [world, setWorld] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [hint, setHint] = useState('');
  const [treeType, setTreeType] = useState('');
  const [exactLocation, setExactLocation] = useState('');
  const [mode, setMode] = useState<Mode>('prespawn');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  type SubmittedValues =
    | { mode: 'prespawn'; world: string; hours: string; minutes: string; hint: string }
    | { mode: 'postspawn'; world: string; treeType: string; exactLocation: string; hint: string }
    | { mode: 'dead'; world: string };
  const submittedValuesRef = useRef<SubmittedValues | null>(null);

  // Auto-submit state
  const [autoSubmit, setAutoSubmit] = useState(() => localStorage.getItem('scout_autoSubmit') === 'true');
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  const [cloudCheck, setCloudCheck] = useState(false);
  const [blinkFrame, setBlinkFrame] = useState(false);
  const cloudCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSubmitRef = useRef<() => void>(() => {});
  type PendingSubmit =
    | { mode: 'prespawn'; worldId: number; msFromNow: number; hintText: string }
    | { mode: 'postspawn'; worldId: number; treeType: string; exactLocation: string; hintText: string };
  const pendingSubmitRef = useRef<PendingSubmit | null>(null);

  // Flush-on-world-hop state. The snapshot is anchored to whichever world the
  // data was entered for — on world change we either submit the snapshot to its
  // captured worldId or clear it (if it wasn't complete enough to submit). The
  // retry slot kicks in only after the WS layer has fully given up reconnecting
  // (status === 'disconnected'); during 'connecting' we trust the WS replay.
  const flushQueueRef = useRef<{
    payload: PendingSubmit;
    oldWorldId: number;
    newWorldId: number;
    ackBaseline: number;
    attempts: number;
  } | null>(null);
  const flushSawDisconnectRef = useRef(false);
  const prevWorldRef = useRef('');
  const prevModeRef = useRef<Mode>('prespawn');
  const ackCountRef = useRef(0);
  ackCountRef.current = ackCount;

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
    showStatus(sv?.mode === 'dead' ? 'Marked dead!' : 'Submitted!', 'ok');
    if (sv) {
      setWorld(w => (w.trim() === sv.world ? '' : w));
      if (sv.mode === 'prespawn') {
        setHint(v => (v.trim().slice(0, 200) === sv.hint ? '' : v));
        setHours(v => (v === sv.hours ? '' : v));
        setMinutes(v => (v === sv.minutes ? '' : v));
      } else if (sv.mode === 'postspawn') {
        setHint(v => (v.trim().slice(0, 200) === sv.hint ? '' : v));
        setTreeType(v => (v === sv.treeType ? '' : v));
        setExactLocation(v => (v === sv.exactLocation ? '' : v));
      } else {
        // dead: reset to prespawn since the tree is gone, spawn timer is next
        setMode('prespawn');
      }
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
        // Reset mode — every world has independent tree state. The next scan
        // (or default 'prespawn') determines the form for the new world.
        setMode('prespawn');
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
    if (!VALID_WORLD_IDS.has(wv) || status !== 'connected' || submitting) return false;
    if (mode === 'prespawn') {
      const h = parseInt(hours || '0', 10) || 0;
      const m = parseInt(minutes || '0', 10) || 0;
      return (h * 60 + m) * 60_000 > 0;
    }
    if (mode === 'dead') return true;
    // postspawn — mirrors dashboard TreeInfoView: treeType + hint are required
    // (generics like "Mature (unknown)" are valid); exactLocation stays optional
    return treeType !== '' && hint.trim().length > 0;
  })();

  const canAutoSubmit = canSubmit && hint.trim().length > 0;

  const isCountingDown = autoCountdown !== null;

  // Start auto-submit countdown when all conditions are met. The snapshot used
  // to be captured here as a defense against world hops mid-countdown — that's
  // now handled by the world-change effect below, which also lets in-flight
  // edits to other fields flow through (so a user correcting "Mature (unknown)"
  // → "Evil Tree (normal)" submits the corrected value).
  useEffect(() => {
    if (autoSubmit && canAutoSubmit && autoCountdown === null && !submitting && !cloudCheck) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoCountdown(10);
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

  // Flush snapshot when the world changes. Data fields are stale relative to
  // the new world, so we either submit them to the OLD world (if complete) or
  // clear them (if partial). Always runs regardless of autoSubmit — bad-data
  // routing is a stronger concern than losing a partial entry on world hop.
  useEffect(() => {
    const oldWorld = prevWorldRef.current;
    const oldMode = prevModeRef.current;
    prevWorldRef.current = world;
    prevModeRef.current = mode;

    if (oldWorld === world) return;

    const oldWorldId = parseInt(oldWorld, 10);
    if (!VALID_WORLD_IDS.has(oldWorldId)) return;

    // If a regular submit is already in flight, it's already routing the old
    // world's data — skip the flush to avoid a duplicate.
    if (submittingRef.current) {
      clearDataFields();
      return;
    }

    const h = parseInt(hours || '0', 10) || 0;
    const m = parseInt(minutes || '0', 10) || 0;
    const newWorldId = parseInt(world, 10);
    // World cleared to '' after a successful submit — not a real hop.
    if (!VALID_WORLD_IDS.has(newWorldId)) return;
    const submittable = oldMode === 'prespawn'
      ? (h * 60 + m) * 60_000 > 0
      : treeType !== '' && hint.trim().length > 0;

    if (submittable) {
      const payload: PendingSubmit = oldMode === 'prespawn'
        ? {
            mode: 'prespawn',
            worldId: oldWorldId,
            msFromNow: (h * 60 + m) * 60_000,
            hintText: hint.trim().slice(0, 200),
          }
        : {
            mode: 'postspawn',
            worldId: oldWorldId,
            treeType,
            exactLocation,
            hintText: hint.trim().slice(0, 200),
          };
      flushQueueRef.current = {
        payload,
        oldWorldId,
        newWorldId,
        ackBaseline: ackCountRef.current,
        attempts: 1,
      };
      flushSawDisconnectRef.current = false;
      sendMutation(buildFlushMutation(payload));
      showStatus(`Hopped W${world} → submitted W${oldWorldId} data`, 'ok');
    } else {
      showStatus(`Hopped W${world} → cleared partial data for W${oldWorldId}`, 'warn');
    }
    clearDataFields();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, mode]);

  // Clear flush queue on any ack — assumes the next ack after a flush is the
  // flush ack. False positives (a different mutation acking first) are rare in
  // a world-hop scenario where no other submit is in flight.
  useEffect(() => {
    const queue = flushQueueRef.current;
    if (queue && ackCount > queue.ackBaseline) {
      flushQueueRef.current = null;
      flushSawDisconnectRef.current = false;
    }
  }, [ackCount]);

  // Retry-once on flush failure. status === 'disconnected' only fires after the
  // WS layer has fully given up (max reconnect / fatal error) and cleared its
  // pending mutations — that's our cue that the in-flight flush will not
  // recover on its own. On the next reconnect we resend once; if THAT also ends
  // in 'disconnected', we drop the queue and surface the failure.
  useEffect(() => {
    if (status === 'disconnected') {
      const queue = flushQueueRef.current;
      if (!queue) return;
      if (queue.attempts >= 2) {
        showStatus(`Could not submit W${queue.oldWorldId} data — re-scout if needed.`, 'error');
        flushQueueRef.current = null;
        flushSawDisconnectRef.current = false;
      } else {
        flushSawDisconnectRef.current = true;
      }
    } else if (status === 'connected') {
      const queue = flushQueueRef.current;
      if (queue && flushSawDisconnectRef.current && queue.attempts < 2) {
        flushSawDisconnectRef.current = false;
        queue.attempts++;
        queue.ackBaseline = ackCountRef.current;
        sendMutation(buildFlushMutation(queue.payload));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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

  function clearDataFields() {
    setHours('');
    setMinutes('');
    setHint('');
    setTreeType('');
    setExactLocation('');
    setAutoCountdown(null);
    pendingSubmitRef.current = null;
  }

  // Mirrors handleSubmit's mutation routing: postspawn data goes through
  // updateTreeFields when the world has an active tree (preserves matureAt /
  // treeHealth / deadAt) and through setTreeInfo otherwise.
  function buildFlushMutation(payload: PendingSubmit): ClientMessage {
    if (payload.mode === 'prespawn') {
      return {
        type: 'setSpawnTimer',
        worldId: payload.worldId,
        msFromNow: payload.msFromNow,
        treeInfo: payload.hintText ? { treeHint: payload.hintText } : undefined,
      };
    }
    const existing = worldStates[payload.worldId];
    const hasActiveTree = existing !== undefined &&
      (existing.treeStatus === 'sapling' || existing.treeStatus === 'mature' || existing.treeStatus === 'alive');
    if (hasActiveTree) {
      return {
        type: 'updateTreeFields',
        worldId: payload.worldId,
        fields: {
          treeType: payload.treeType as TreeType,
          treeHint: payload.hintText,
          ...(payload.exactLocation && { treeExactLocation: payload.exactLocation }),
        },
      };
    }
    return {
      type: 'setTreeInfo',
      worldId: payload.worldId,
      info: {
        treeType: payload.treeType as TreeType,
        treeHint: payload.hintText,
        ...(payload.exactLocation && { treeExactLocation: payload.exactLocation }),
      },
    };
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

    // Tree-just-died signal: the Spirit Tree confirms no current tree and no
    // upcoming spawn timer. Fire markDead unconditionally (idempotent), cancel
    // any pending auto-submit (its data is for the previous tree), and reset
    // mode to prespawn since postspawn fields no longer apply.
    if (result.treeDied) {
      const worldId = getWorldId();
      pendingSubmitRef.current = null;
      setAutoCountdown(null);
      setMode('prespawn');
      if (worldId !== null) {
        sendMutation({ type: 'markDead', worldId });
        detected.push(`marked W${worldId} dead`);
      } else {
        detected.push('tree dead (no world set)');
      }
    }

    // Mode transitions: bare greeting sets mode; explicit field detections
    // override (the last setMode call wins). Pre-spawn timer / post-spawn
    // location & type are mutually exclusive in the source dialogs, so the
    // ordering here only matters for defensiveness.
    if (result.greetingMode) setMode(result.greetingMode);
    if (result.hours > 0 || result.minutes > 0) setMode('prespawn');
    if (result.exactLocation || result.treeType) setMode('postspawn');

    // Pre-spawn fields
    if (result.hours > 0 || result.minutes > 0) {
      setHours(String(result.hours));
      setMinutes(String(result.minutes));
      detected.push(`${result.hours}h ${result.minutes}m`);
    }

    // Post-spawn fields
    if (result.exactLocation) {
      setExactLocation(result.exactLocation);
      detected.push(`@ ${result.exactLocation}`);
    }
    if (result.treeType) {
      setTreeType(result.treeType);
      detected.push(`type: ${result.treeType}`);
    }

    // Shared. The post-spawn dialog ("It is an abomination of nature, which has
    // appeared just north of Yanille...") yields an exact location but no hint
    // text — back-derive the canonical hint so both fields submit together.
    const derivedHint = result.hint ?? (result.exactLocation ? hintForLocation(result.exactLocation) : '');
    if (derivedHint) {
      setHint(derivedHint);
      const truncated = derivedHint.length > 40 ? derivedHint.slice(0, 40) + '...' : derivedHint;
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
    if (status === 'disconnected') return;

    const submitMode: Mode = pending?.mode ?? mode;
    const worldId = pending?.worldId ?? getWorldId();
    if (!worldId) return;

    setAutoCountdown(null);

    if (submitMode === 'dead') {
      setSubmitting(true);
      submittingRef.current = true;
      showStatus('Submitting...');
      submittedValuesRef.current = { mode: 'dead', world: String(worldId) };
      sendMutation({ type: 'markDead', worldId });
      return;
    }

    if (submitMode === 'postspawn') {
      const tt = pending?.mode === 'postspawn' ? pending.treeType : treeType;
      const xl = pending?.mode === 'postspawn' ? pending.exactLocation : exactLocation;
      const ht = pending?.mode === 'postspawn' ? pending.hintText : hint.trim().slice(0, 200);
      if (!tt) return;

      setSubmitting(true);
      submittingRef.current = true;
      showStatus('Submitting...');

      submittedValuesRef.current = {
        mode: 'postspawn',
        world: String(worldId),
        treeType: tt,
        exactLocation: xl,
        hint: ht,
      };

      // Mirror dashboard's TreeInfoView routing: when an active tree already
      // exists (sapling/mature/alive), patch via updateTreeFields to preserve
      // matureAt/treeHealth/deadAt. Otherwise fall through to setTreeInfo,
      // which is the correct create path for fresh sightings (and also for
      // dead/none worlds where there's no live timer to lose).
      const existing = worldStates[worldId];
      const hasActiveTree = existing !== undefined &&
        (existing.treeStatus === 'sapling' || existing.treeStatus === 'mature' || existing.treeStatus === 'alive');

      if (hasActiveTree) {
        sendMutation({
          type: 'updateTreeFields',
          worldId,
          fields: {
            treeType: tt as TreeType,
            treeHint: ht,
            ...(xl && { treeExactLocation: xl }),
          },
        });
      } else {
        sendMutation({
          type: 'setTreeInfo',
          worldId,
          info: {
            treeType: tt as TreeType,
            treeHint: ht,
            ...(xl && { treeExactLocation: xl }),
          },
        });
      }
      return;
    }

    // prespawn
    const msFromNow = pending?.mode === 'prespawn' ? pending.msFromNow : getTotalMs();
    const hintText = pending?.mode === 'prespawn' ? pending.hintText : hint.trim().slice(0, 200);
    if (msFromNow <= 0) return;

    setSubmitting(true);
    submittingRef.current = true;
    showStatus('Submitting...');

    const h = Math.floor(msFromNow / 3_600_000);
    const m = Math.floor((msFromNow % 3_600_000) / 60_000);
    submittedValuesRef.current = {
      mode: 'prespawn',
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

  // Bidirectional hint ↔ exact-location sync, mirroring src/hooks/useLocationHint
  // for parity with the dashboard's TreeInfoView / WorldDetailView.
  function handleHintChange(newHint: string) {
    setHint(newHint);
    if (exactLocation && !locationsForHint(newHint).includes(exactLocation)) {
      setExactLocation('');
    } else {
      setExactLocation(resolveExactLocation(newHint));
    }
  }

  function handleExactLocationChange(loc: string) {
    setExactLocation(loc);
    if (loc && (!hint || !locationsForHint(hint).includes(loc))) {
      const derived = hintForLocation(loc);
      if (derived) setHint(derived);
    }
  }

  function handleClear() {
    setAutoCountdown(null);
    setWorld('');
    setHours('');
    setMinutes('');
    setHint('');
    setTreeType('');
    setExactLocation('');
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

  function handleAutoScanToggle() {
    setAutoScan(s => {
      if (!s) showStatus('Auto-detect on. Clicks will trigger a scan. Keyboard interactions do not.');
      else clearStatus();
      const next = !s;
      localStorage.setItem('scout_autoScan', String(next));
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

        <ModeNav mode={mode} onChange={setMode} />

        {mode === 'postspawn' ? (
          <PostSpawnForm
            treeType={treeType}
            exactLocation={exactLocation}
            hint={hint}
            statusMsg={statusMsg}
            statusKind={statusKind}
            hasPixel={hasPixel}
            canSubmit={canSubmit}
            onTreeTypeChange={setTreeType}
            onExactLocationChange={handleExactLocationChange}
            onHintChange={handleHintChange}
            autoScan={autoScan}
            isScanning={isScanning}
            onScanDialog={handleScanDialog}
            onAutoScanToggle={handleAutoScanToggle}
            autoSubmit={autoSubmit}
            autoCountdown={autoCountdown}
            cloudCheck={cloudCheck}
            blinkFrame={blinkFrame}
            onAutoSubmitToggle={handleAutoSubmitToggle}
            onSubmit={handleSubmit}
            onClear={handleClear}
          />
        ) : mode === 'dead' ? (
          <DeadForm
            statusMsg={statusMsg}
            statusKind={statusKind}
            canSubmit={canSubmit}
            onSubmit={handleSubmit}
            onClear={handleClear}
          />
        ) : (
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
            onHintChange={handleHintChange}
            autoScan={autoScan}
            isScanning={isScanning}
            onScanDialog={handleScanDialog}
            onAutoScanToggle={handleAutoScanToggle}
            autoSubmit={autoSubmit}
            autoCountdown={autoCountdown}
            cloudCheck={cloudCheck}
            blinkFrame={blinkFrame}
            onAutoSubmitToggle={handleAutoSubmitToggle}
            onSubmit={handleSubmit}
            onClear={handleClear}
          />
        )}

        {import.meta.env.MODE === 'development' && <DebugPanel />}
      </div>
    </TooltipProvider>
  );
}
