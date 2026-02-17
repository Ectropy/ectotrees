import { useState, useCallback, useRef, useEffect } from 'react';
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
}

const API_BASE = '/api';
const WS_BASE = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30_000;
const STALE_TIMEOUT_MS = 45_000; // force-close if no message received in this window
const MAX_RECONNECT_ATTEMPTS = 10;
const ACK_TIMEOUT_MS = 5_000;

const FATAL_ERRORS = new Set(['Session is full.', 'Session not found.']);

interface PendingMutation {
  msg: ClientMessage;
  timer: ReturnType<typeof setTimeout> | null;
}

export function useSession(onSessionLost?: () => void) {
  const [session, setSession] = useState<SessionState>({
    status: 'disconnected',
    code: null,
    clientCount: 0,
    error: null,
    reconnectAttempt: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<{
    onSnapshot: (states: WorldStates) => void;
    onWorldUpdate: (worldId: number, state: WorldState | null) => void;
  } | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef<string | null>(null);
  const intentionalCloseRef = useRef(false);
  const lastServerErrorRef = useRef<string | null>(null);
  const onSessionLostRef = useRef(onSessionLost);
  const snapshotReceivedRef = useRef(false);
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
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
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

  function resetStaleTimer(ws: WebSocket) {
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = setTimeout(() => {
      // No message from server in STALE_TIMEOUT_MS — connection is likely dead
      if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }, STALE_TIMEOUT_MS);
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
      reconnectAttemptRef.current = 0;
      lastServerErrorRef.current = null;
      setSession(prev => ({ ...prev, status: 'connected', error: null, reconnectAttempt: 0 }));
      resetStaleTimer(ws);

      // Start ping interval
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      resetStaleTimer(ws);
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'snapshot':
          handlersRef.current?.onSnapshot(msg.worlds);
          snapshotReceivedRef.current = true;
          replayPendingMutations();
          break;
        case 'worldUpdate':
          handlersRef.current?.onWorldUpdate(msg.worldId, msg.state);
          break;
        case 'clientCount':
          setSession(prev => ({ ...prev, clientCount: msg.count }));
          break;
        case 'pong':
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
          setSession({ status: 'disconnected', code: null, clientCount: 0, error: msg.reason, reconnectAttempt: 0 });
          break;
      }
    };

    ws.onclose = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
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
        clearPending();
        setSession(prev => ({
          ...prev,
          status: 'disconnected',
          code: null,
          reconnectAttempt: 0,
        }));
        return;
      }

      // Give up after max attempts
      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        onSessionLostRef.current?.();
        const lostCode = codeRef.current;
        clearPending();
        setSession(prev => ({
          ...prev,
          status: 'disconnected',
          error: 'Unable to reconnect. Your session may still be active.',
          reconnectAttempt: attempt,
          code: lostCode,
        }));
        return;
      }

      // Attempt reconnect
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;
      setSession(prev => ({ ...prev, status: 'connecting', reconnectAttempt: attempt + 1 }));

      reconnectTimerRef.current = setTimeout(() => {
        if (codeRef.current) {
          connectWs(codeRef.current);
        }
      }, delay);
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  const createSession = useCallback(async (): Promise<string | null> => {
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
    clearPending();
    setSession(prev => ({ ...prev, code, reconnectAttempt: 0 }));
    connectWs(code);
    return true;
  }, []);

  const leaveSession = useCallback(() => {
    intentionalCloseRef.current = true;
    cleanup();
    codeRef.current = null;
    reconnectAttemptRef.current = 0;
    clearPending();
    setSession({ status: 'disconnected', code: null, clientCount: 0, error: null, reconnectAttempt: 0 });
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

  const syncChannel: SyncChannel | null =
    session.status !== 'disconnected' ? { sendMutation, subscribe } : null;

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
