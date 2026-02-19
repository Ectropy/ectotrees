import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { WorldStates, WorldState } from '../types';
import type { ClientMessage, ServerMessage } from '../../shared/protocol.ts';

export type SessionStatus = 'disconnected' | 'connecting' | 'connected';

export interface SyncChannel {
  sendMutation: (msg: ClientMessage) => void;
  subscribe: (handlers: {
    onSnapshot: (states: WorldStates) => void;
    onWorldUpdate: (worldId: number, state: WorldState | null) => void;
  }) => () => void;
}

export interface SessionState {
  status: SessionStatus;
  code: string | null;
  clientCount: number;
  error: string | null;
  reconnectAttempt: number;
  reconnectAt: number | null;  // ms timestamp when next retry fires; null while not waiting
}

const API_BASE = resolveApiBase();
const WS_BASE = resolveWsBase();
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30_000;
const PING_ACK_TIMEOUT_MS = 8_000;  // force-close if pong not received within this window after a ping
export const MAX_RECONNECT_ATTEMPTS = 10;
const ACK_TIMEOUT_MS = 5_000;
const SESSION_CODE_STORAGE_KEY = 'evilTree_sessionCode';

const FATAL_ERRORS = new Set(['Session is full.', 'Session not found.']);

interface PendingMutation {
  msg: ClientMessage;
  timer: ReturnType<typeof setTimeout> | null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeBasePath(value: string): string {
  const normalized = trimTrailingSlash(value.trim());
  if (!normalized) return '';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function resolveApiBase(): string {
  const envBase = import.meta.env.VITE_API_BASE;
  if (typeof envBase === 'string' && envBase.trim()) {
    if (/^https?:\/\//i.test(envBase)) {
      return trimTrailingSlash(envBase.trim());
    }
    return normalizeBasePath(envBase);
  }
  return '/api';
}

function resolveWsBase(): string {
  const envBase = import.meta.env.VITE_WS_BASE;
  if (typeof envBase === 'string' && envBase.trim()) {
    if (/^wss?:\/\//i.test(envBase)) {
      return trimTrailingSlash(envBase.trim());
    }
    if (typeof window !== 'undefined') {
      return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${normalizeBasePath(envBase)}`;
    }
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  }
  return '';
}

function loadPersistedSessionCode(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_CODE_STORAGE_KEY);
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    return /^[A-Z2-9]{6}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

function persistSessionCode(code: string | null) {
  try {
    if (code) {
      localStorage.setItem(SESSION_CODE_STORAGE_KEY, code);
    } else {
      localStorage.removeItem(SESSION_CODE_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function useSession(onSessionLost?: () => void) {
  const initialCode = loadPersistedSessionCode();
  const [session, setSession] = useState<SessionState>({
    status: 'disconnected',
    code: initialCode,
    clientCount: 0,
    error: null,
    reconnectAttempt: 0,
    reconnectAt: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<{
    onSnapshot: (states: WorldStates) => void;
    onWorldUpdate: (worldId: number, state: WorldState | null) => void;
  } | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef<string | null>(initialCode);
  const intentionalCloseRef = useRef(false);
  const lastServerErrorRef = useRef<string | null>(null);
  const onSessionLostRef = useRef(onSessionLost);
  const snapshotReceivedRef = useRef(false);
  const pendingSnapshotRef = useRef<WorldStates | null>(null);
  const initialStatesRef = useRef<WorldStates | null>(null);
  const msgIdCounterRef = useRef(1);
  const pendingMutationsRef = useRef<Map<number, PendingMutation>>(new Map());

  useEffect(() => {
    onSessionLostRef.current = onSessionLost;
  }, [onSessionLost]);

  function clearPendingTimers() {
    for (const entry of pendingMutationsRef.current.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
  }

  function clearPending() {
    clearPendingTimers();
    pendingMutationsRef.current = new Map();
  }

  function cleanup() {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (pingAckTimerRef.current) {
      clearTimeout(pingAckTimerRef.current);
      pingAckTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    clearPendingTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }

  function replayPendingMutations() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const oldPending = pendingMutationsRef.current;
    pendingMutationsRef.current = new Map();
    for (const entry of oldPending.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      // Re-send with a new msgId and new ACK timer
      const newId = msgIdCounterRef.current++;
      const msgWithId = { ...entry.msg, msgId: newId };
      const timer = setTimeout(() => {
        // ACK not received — connection is dead
        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, ACK_TIMEOUT_MS);
      pendingMutationsRef.current.set(newId, { msg: entry.msg, timer });
      ws.send(JSON.stringify(msgWithId));
    }
  }

  function connectWs(code: string) {
    // Prevent the old WS's onclose from scheduling a duplicate reconnect
    intentionalCloseRef.current = true;
    cleanup();
    intentionalCloseRef.current = false;

    snapshotReceivedRef.current = false;
    setSession(prev => ({ ...prev, status: 'connecting', error: null }));

    const ws = new WebSocket(`${WS_BASE}/ws?code=${code}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      reconnectAttemptRef.current = 0;
      lastServerErrorRef.current = null;
      setSession(prev => ({ ...prev, status: 'connected', error: null, reconnectAttempt: 0, reconnectAt: null }));

      // Send local state to populate a newly created session
      if (initialStatesRef.current) {
        ws.send(JSON.stringify({ type: 'initializeState', worlds: initialStatesRef.current }));
      }

      // Start ping interval with ACK timeout
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
          // Expect a pong back within PING_ACK_TIMEOUT_MS; if not, the connection is dead
          if (pingAckTimerRef.current) clearTimeout(pingAckTimerRef.current);
          pingAckTimerRef.current = setTimeout(() => {
            pingAckTimerRef.current = null;
            if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
          }, PING_ACK_TIMEOUT_MS);
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'snapshot': {
          // When creating a session, merge local state over the empty server snapshot
          const worlds = initialStatesRef.current
            ? { ...msg.worlds, ...initialStatesRef.current }
            : msg.worlds;
          initialStatesRef.current = null;
          if (handlersRef.current) {
            handlersRef.current.onSnapshot(worlds);
          } else {
            pendingSnapshotRef.current = worlds;
          }
          snapshotReceivedRef.current = true;
          replayPendingMutations();
          break;
        }
        case 'worldUpdate':
          handlersRef.current?.onWorldUpdate(msg.worldId, msg.state);
          break;
        case 'clientCount':
          setSession(prev => ({ ...prev, clientCount: msg.count }));
          break;
        case 'pong':
          if (pingAckTimerRef.current) {
            clearTimeout(pingAckTimerRef.current);
            pingAckTimerRef.current = null;
          }
          break;
        case 'ack': {
          const entry = pendingMutationsRef.current.get(msg.msgId);
          if (entry) {
            if (entry.timer) clearTimeout(entry.timer);
            pendingMutationsRef.current.delete(msg.msgId);
          }
          break;
        }
        case 'error':
          lastServerErrorRef.current = msg.message;
          setSession(prev => ({ ...prev, error: msg.message }));
          break;
        case 'sessionClosed':
          intentionalCloseRef.current = true;
          onSessionLostRef.current?.();
          cleanup();
          codeRef.current = null;
          clearPending();
          setSession({ status: 'disconnected', code: null, clientCount: 0, error: msg.reason, reconnectAttempt: 0, reconnectAt: null });
          break;
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;

      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (pingAckTimerRef.current) {
        clearTimeout(pingAckTimerRef.current);
        pingAckTimerRef.current = null;
      }
      // Clear ACK timers (we'll replay on reconnect, not timeout again)
      for (const entry of pendingMutationsRef.current.values()) {
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
        }
      }

      if (intentionalCloseRef.current) {
        intentionalCloseRef.current = false;
        return;
      }

      // Don't reconnect on fatal server rejections
      if (lastServerErrorRef.current && FATAL_ERRORS.has(lastServerErrorRef.current)) {
        codeRef.current = null;
        persistSessionCode(null);
        clearPending();
        setSession(prev => ({
          ...prev,
          status: 'disconnected',
          code: null,
          reconnectAttempt: 0,
          reconnectAt: null,
        }));
        return;
      }

      // Give up after max attempts
      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        console.log(`Reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
        onSessionLostRef.current?.();
        const lostCode = codeRef.current;
        clearPending();
        setSession(prev => ({
          ...prev,
          status: 'disconnected',
          error: 'Unable to reconnect.',
          reconnectAttempt: attempt,
          code: lostCode,
          reconnectAt: null,
        }));
        return;
      }

      // Attempt reconnect
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;
      setSession(prev => ({ ...prev, status: 'connecting', reconnectAttempt: attempt + 1, reconnectAt: Date.now() + delay }));
      console.log(`Reconnect attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);

      reconnectTimerRef.current = setTimeout(() => {
        setSession(prev => ({ ...prev, reconnectAt: null }));
        if (codeRef.current) {
          connectWs(codeRef.current);
        }
      }, delay);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      // onclose will fire after this
    };
  }

  const createSession = useCallback(async (initialStates?: WorldStates): Promise<string | null> => {
    setSession(prev => ({ ...prev, error: null }));
    try {
      const res = await fetch(`${API_BASE}/session`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSession(prev => ({ ...prev, error: data.error ?? 'Failed to create session.' }));
        return null;
      }
      const code = data.code as string;
      codeRef.current = code;
      persistSessionCode(code);
      initialStatesRef.current = initialStates ?? null;
      clearPending();
      setSession(prev => ({ ...prev, code, reconnectAttempt: 0 }));
      connectWs(code);
      return code;
    } catch {
      setSession(prev => ({ ...prev, error: 'Network error creating session.' }));
      return null;
    }
  }, []);

  const joinSession = useCallback(async (code: string): Promise<boolean> => {
    setSession(prev => ({ ...prev, error: null }));
    // Validate the session exists before connecting
    try {
      const res = await fetch(`${API_BASE}/session/${code}`);
      if (!res.ok) {
        const data = await res.json();
        setSession(prev => ({ ...prev, error: data.error ?? 'Session not found.' }));
        return false;
      }
    } catch {
      setSession(prev => ({ ...prev, error: 'Network error joining session.' }));
      return false;
    }

    codeRef.current = code;
    persistSessionCode(code);
    clearPending();
    setSession(prev => ({ ...prev, code, reconnectAttempt: 0 }));
    connectWs(code);
    return true;
  }, []);

  const leaveSession = useCallback(() => {
    intentionalCloseRef.current = true;
    cleanup();
    codeRef.current = null;
    persistSessionCode(null);
    reconnectAttemptRef.current = 0;
    clearPending();
    setSession({ status: 'disconnected', code: null, clientCount: 0, error: null, reconnectAttempt: 0, reconnectAt: null });
  }, []);

  const rejoinSession = useCallback(async (code: string): Promise<boolean> => {
    reconnectAttemptRef.current = 0;
    clearPending();
    return joinSession(code);
  }, [joinSession]);

  const sendMutation = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    const id = msgIdCounterRef.current++;
    const msgWithId = { ...msg, msgId: id };

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msgWithId));
      // Set ACK timeout — if server doesn't confirm, assume connection is dead
      const timer = setTimeout(() => {
        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, ACK_TIMEOUT_MS);
      pendingMutationsRef.current.set(id, { msg, timer });
    } else {
      // Queue for replay on reconnect (no timer needed — not connected)
      pendingMutationsRef.current.set(id, { msg, timer: null });
    }
  }, []);

  const subscribe = useCallback((handlers: {
    onSnapshot: (states: WorldStates) => void;
    onWorldUpdate: (worldId: number, state: WorldState | null) => void;
  }) => {
    handlersRef.current = handlers;
    if (pendingSnapshotRef.current) {
      handlers.onSnapshot(pendingSnapshotRef.current);
      pendingSnapshotRef.current = null;
    }
    return () => { handlersRef.current = null; };
  }, []);

  const dismissError = useCallback(() => {
    setSession(prev => ({ ...prev, error: null }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      cleanup();
    };
  }, []);

  // Resume prior session across page reloads (common on mobile radio changes).
  useEffect(() => {
    if (codeRef.current && session.status === 'disconnected') {
      connectWs(codeRef.current);
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncChannel: SyncChannel | null = useMemo(() => (
    session.status !== 'disconnected' ? { sendMutation, subscribe } : null
  ), [session.status, sendMutation, subscribe]);

  return {
    session,
    syncChannel,
    createSession,
    joinSession,
    rejoinSession,
    leaveSession,
    dismissError,
  };
}
