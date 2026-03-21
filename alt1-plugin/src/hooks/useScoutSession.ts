import { useState, useCallback, useRef, useEffect } from 'react';
import type { ClientMessage, ServerMessage } from '@shared/protocol';
import { RECONNECT_DELAYS, MAX_RECONNECT_ATTEMPTS } from '@shared/reconnect';

export type SessionStatus = 'disconnected' | 'connecting' | 'connected';

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api';
const WS_BASE: string = import.meta.env.VITE_WS_BASE ?? '';
const PING_INTERVAL_MS = 30_000;
const PING_ACK_TIMEOUT_MS = 8_000;
const ACK_TIMEOUT_MS = 5_000;
const SESSION_CODE_KEY = 'evilTree_sessionCode';
const INVITE_TOKEN_KEY = 'evilTree_inviteToken';
const FATAL_ERRORS = new Set([
  'Session is full.',
  'Session not found.',
  'This is a private session. You need an invite link to join.',
]);

interface PendingMutation {
  msg: ClientMessage;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface ScoutSessionState {
  status: SessionStatus;
  code: string | null;
  inviteToken: string | null;
  error: string | null;
  memberName: string | null;
  memberRole: string | null;
  reconnectAttempt: number;
  reconnectAt: number | null;
  /** Increments on each server ACK. Watch this to detect when a mutation was confirmed. */
  ackCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildWsUrl(): string {
  return WS_BASE
    ? `${WS_BASE}/ws`
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
}

function extractInviteToken(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const hashMatch = url.hash.match(/^#invite=([A-Za-z0-9]+)$/);
    if (hashMatch && /^[A-HJ-NP-Z2-9]{12}$/.test(hashMatch[1].toUpperCase())) {
      return hashMatch[1].toUpperCase();
    }
  } catch { /* not a URL */ }
  const upper = trimmed.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
  if (/^[A-HJ-NP-Z2-9]{12}$/.test(upper)) return upper;
  return null;
}

function loadCode(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_CODE_KEY);
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
  } catch { return null; }
}

function persistCode(code: string | null) {
  try {
    if (code) localStorage.setItem(SESSION_CODE_KEY, code);
    else localStorage.removeItem(SESSION_CODE_KEY);
  } catch { /* ignore */ }
}

function loadInviteToken(): string | null {
  try {
    const raw = localStorage.getItem(INVITE_TOKEN_KEY);
    if (!raw) return null;
    const upper = raw.trim().toUpperCase();
    return /^[A-HJ-NP-Z2-9]{12}$/.test(upper) ? upper : null;
  } catch { return null; }
}

function persistInviteToken(token: string | null) {
  try {
    if (token) localStorage.setItem(INVITE_TOKEN_KEY, token);
    else localStorage.removeItem(INVITE_TOKEN_KEY);
  } catch { /* ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useScoutSession() {
  const [state, setState] = useState<ScoutSessionState>(() => ({
    status: 'disconnected',
    code: loadCode(),
    inviteToken: loadInviteToken(),
    error: null,
    memberName: null,
    memberRole: null,
    reconnectAttempt: 0,
    reconnectAt: null,
    ackCount: 0,
  }));

  const wsRef = useRef<WebSocket | null>(null);
  const codeRef = useRef<string | null>(state.code);
  const inviteTokenRef = useRef<string | null>(state.inviteToken);
  const intentionalCloseRef = useRef(false);
  const lastServerErrorRef = useRef<string | null>(null);
  const snapshotReceivedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgIdCounterRef = useRef(1);
  const pendingMutationsRef = useRef<Map<number, PendingMutation>>(new Map());

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
    if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
    if (pingAckTimerRef.current) { clearTimeout(pingAckTimerRef.current); pingAckTimerRef.current = null; }
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    clearPendingTimers();
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
  }

  function replayPendingMutations() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const old = pendingMutationsRef.current;
    pendingMutationsRef.current = new Map();
    for (const entry of old.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      const newId = msgIdCounterRef.current++;
      const msgWithId = { ...entry.msg, msgId: newId };
      const timer = setTimeout(() => {
        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) ws.close();
      }, ACK_TIMEOUT_MS);
      pendingMutationsRef.current.set(newId, { msg: entry.msg, timer });
      ws.send(JSON.stringify(msgWithId));
    }
  }

  function connectWs(code: string | null, inviteToken?: string) {
    intentionalCloseRef.current = true;
    cleanup();
    intentionalCloseRef.current = false;

    snapshotReceivedRef.current = false;
    setState(prev => ({ ...prev, status: 'connecting', error: null }));

    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      reconnectAttemptRef.current = 0;
      lastServerErrorRef.current = null;
      setState(prev => ({ ...prev, status: 'connected', error: null, reconnectAttempt: 0, reconnectAt: null }));
      if (inviteToken) {
        ws.send(JSON.stringify({ type: 'authInvite', token: inviteToken }));
      } else if (code) {
        ws.send(JSON.stringify({ type: 'authSession', code }));
      }
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      let msg: ServerMessage;
      try { msg = JSON.parse(event.data as string); } catch { return; }

      switch (msg.type) {
        case 'authSuccess':
          if (msg.personalToken) {
            inviteTokenRef.current = msg.personalToken;
            persistInviteToken(msg.personalToken);
            setState(prev => ({ ...prev, inviteToken: msg.personalToken! }));
          }
          if (msg.sessionCode && codeRef.current !== msg.sessionCode) {
            codeRef.current = msg.sessionCode;
            persistCode(msg.sessionCode);
            setState(prev => ({ ...prev, code: msg.sessionCode! }));
          }
          ws.send(JSON.stringify({ type: 'identify', clientType: 'scout' }));
          pingTimerRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
              if (pingAckTimerRef.current) clearTimeout(pingAckTimerRef.current);
              pingAckTimerRef.current = setTimeout(() => {
                pingAckTimerRef.current = null;
                if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) ws.close();
              }, PING_ACK_TIMEOUT_MS);
            }
          }, PING_INTERVAL_MS);
          break;

        case 'authError':
          if (inviteTokenRef.current) {
            inviteTokenRef.current = null;
            persistInviteToken(null);
          }
          intentionalCloseRef.current = true;
          lastServerErrorRef.current = msg.reason;
          setState(prev => ({ ...prev, error: msg.reason, status: 'disconnected', inviteToken: null, reconnectAttempt: 0, reconnectAt: null }));
          ws.close();
          break;

        case 'snapshot':
          // Scout plugin only submits data — snapshot contents are not displayed.
          snapshotReceivedRef.current = true;
          replayPendingMutations();
          break;

        case 'identity':
          if (msg.sessionCode && codeRef.current !== msg.sessionCode) {
            codeRef.current = msg.sessionCode;
            persistCode(msg.sessionCode);
            setState(prev => ({ ...prev, code: msg.sessionCode!, memberName: msg.name, memberRole: msg.role }));
          } else {
            setState(prev => ({ ...prev, memberName: msg.name, memberRole: msg.role }));
          }
          break;

        case 'personalToken':
          inviteTokenRef.current = msg.token;
          persistInviteToken(msg.token);
          setState(prev => ({ ...prev, inviteToken: msg.token }));
          break;

        case 'redirect':
          codeRef.current = msg.code;
          persistCode(msg.code);
          clearPending();
          setState(prev => ({ ...prev, code: msg.code }));
          connectWs(msg.code, inviteTokenRef.current ?? undefined);
          break;

        case 'pong':
          if (pingAckTimerRef.current) { clearTimeout(pingAckTimerRef.current); pingAckTimerRef.current = null; }
          break;

        case 'ack': {
          const entry = pendingMutationsRef.current.get(msg.msgId);
          if (entry) {
            if (entry.timer) clearTimeout(entry.timer);
            pendingMutationsRef.current.delete(msg.msgId);
          }
          setState(prev => ({ ...prev, ackCount: prev.ackCount + 1 }));
          break;
        }

        case 'error':
          lastServerErrorRef.current = msg.message;
          setState(prev => ({ ...prev, error: msg.message }));
          break;

        case 'sessionClosed':
          intentionalCloseRef.current = true;
          cleanup();
          codeRef.current = null;
          persistCode(null);
          clearPending();
          setState(prev => ({ ...prev, status: 'disconnected', code: null, error: msg.reason, reconnectAttempt: 0, reconnectAt: null }));
          break;
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;

      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null; }
      if (pingAckTimerRef.current) { clearTimeout(pingAckTimerRef.current); pingAckTimerRef.current = null; }
      // Pause ACK timers — will replay on reconnect
      for (const entry of pendingMutationsRef.current.values()) {
        if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
      }

      if (intentionalCloseRef.current) { intentionalCloseRef.current = false; return; }

      // Fatal server rejection → give up
      if (lastServerErrorRef.current && FATAL_ERRORS.has(lastServerErrorRef.current)) {
        const fatalMsg = lastServerErrorRef.current;
        codeRef.current = null;
        persistCode(null);
        clearPending();
        setState(prev => ({ ...prev, status: 'disconnected', code: null, error: fatalMsg, reconnectAttempt: 0, reconnectAt: null }));
        return;
      }

      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        clearPending();
        setState(prev => ({ ...prev, status: 'disconnected', error: 'Unable to reconnect.', reconnectAttempt: attempt, reconnectAt: null }));
        return;
      }

      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;
      setState(prev => ({ ...prev, status: 'connecting', reconnectAttempt: attempt + 1, reconnectAt: Date.now() + delay }));

      reconnectTimerRef.current = setTimeout(() => {
        setState(prev => ({ ...prev, reconnectAt: null }));
        if (inviteTokenRef.current) connectWs(null, inviteTokenRef.current);
        else if (codeRef.current) connectWs(codeRef.current);
      }, delay);
    };

    ws.onerror = () => { /* onclose fires after */ };
  }

  // Auto-resume on mount; cleanup on unmount
  useEffect(() => {
    if (inviteTokenRef.current) connectWs(null, inviteTokenRef.current);
    else if (codeRef.current) connectWs(codeRef.current);

    return () => {
      intentionalCloseRef.current = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinSession = useCallback((code: string): boolean => {
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      setState(prev => ({ ...prev, error: 'Invalid session code.' }));
      return false;
    }
    codeRef.current = code;
    persistCode(code);
    clearPending();
    reconnectAttemptRef.current = 0;
    setState(prev => ({ ...prev, code, error: null, reconnectAttempt: 0 }));
    connectWs(code);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaveSession = useCallback(() => {
    intentionalCloseRef.current = true;
    if (wsRef.current) { wsRef.current.close(1000, 'intentionally disconnected'); wsRef.current = null; }
    cleanup();
    codeRef.current = null;
    persistCode(null);
    inviteTokenRef.current = null;
    persistInviteToken(null);
    reconnectAttemptRef.current = 0;
    clearPending();
    setState({
      status: 'disconnected',
      code: null,
      inviteToken: null,
      error: null,
      memberName: null,
      memberRole: null,
      reconnectAttempt: 0,
      reconnectAt: null,
      ackCount: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMutation = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    const id = msgIdCounterRef.current++;
    const msgWithId = { ...msg, msgId: id };
    if (ws && ws.readyState === WebSocket.OPEN && snapshotReceivedRef.current) {
      ws.send(JSON.stringify(msgWithId));
      const timer = setTimeout(() => {
        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) ws.close();
      }, ACK_TIMEOUT_MS);
      pendingMutationsRef.current.set(id, { msg, timer });
    } else {
      pendingMutationsRef.current.set(id, { msg, timer: null });
    }
  }, []);

  const dismissError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const joinWithToken = useCallback((tokenOrUrl: string): boolean => {
    const token = extractInviteToken(tokenOrUrl);
    if (!token) return false;
    inviteTokenRef.current = token;
    persistInviteToken(token);
    clearPending();
    reconnectAttemptRef.current = 0;
    setState(prev => ({ ...prev, error: null, inviteToken: token, reconnectAttempt: 0 }));
    connectWs(null, token);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reportWorld = useCallback((worldId: number | null) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'reportWorld', worldId }));
    }
  }, []);

  return {
    ...state,
    joinSession,
    leaveSession,
    sendMutation,
    dismissError,
    joinWithToken,
    reportWorld,
  };
}

