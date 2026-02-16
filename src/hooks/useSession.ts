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
}

const API_BASE = '/api';
const WS_BASE = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30_000;

export function useSession() {
  const [session, setSession] = useState<SessionState>({
    status: 'disconnected',
    code: null,
    clientCount: 0,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<{
    onSnapshot: (states: WorldStates) => void;
    onWorldUpdate: (worldId: number, state: WorldState | null) => void;
  } | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeRef = useRef<string | null>(null);
  const intentionalCloseRef = useRef(false);

  function cleanup() {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }

  function connectWs(code: string) {
    cleanup();
    setSession(prev => ({ ...prev, status: 'connecting', error: null }));

    const ws = new WebSocket(`${WS_BASE}/ws?code=${code}`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptRef.current = 0;
      setSession(prev => ({ ...prev, status: 'connected', error: null }));

      // Start ping interval
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'snapshot':
          handlersRef.current?.onSnapshot(msg.worlds);
          break;
        case 'worldUpdate':
          handlersRef.current?.onWorldUpdate(msg.worldId, msg.state);
          break;
        case 'clientCount':
          setSession(prev => ({ ...prev, clientCount: msg.count }));
          break;
        case 'pong':
          break;
        case 'error':
          setSession(prev => ({ ...prev, error: msg.message }));
          break;
        case 'sessionClosed':
          intentionalCloseRef.current = true;
          cleanup();
          codeRef.current = null;
          setSession({ status: 'disconnected', code: null, clientCount: 0, error: msg.reason });
          break;
      }
    };

    ws.onclose = () => {
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }

      if (intentionalCloseRef.current) {
        intentionalCloseRef.current = false;
        return;
      }

      // Attempt reconnect
      const attempt = reconnectAttemptRef.current;
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      reconnectAttemptRef.current = attempt + 1;
      setSession(prev => ({ ...prev, status: 'connecting' }));

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
      setSession(prev => ({ ...prev, code }));
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
    setSession(prev => ({ ...prev, code }));
    connectWs(code);
    return true;
  }, []);

  const leaveSession = useCallback(() => {
    intentionalCloseRef.current = true;
    cleanup();
    codeRef.current = null;
    reconnectAttemptRef.current = 0;
    setSession({ status: 'disconnected', code: null, clientCount: 0, error: null });
  }, []);

  const sendMutation = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((handlers: {
    onSnapshot: (states: WorldStates) => void;
    onWorldUpdate: (worldId: number, state: WorldState | null) => void;
  }) => {
    handlersRef.current = handlers;
    return () => { handlersRef.current = null; };
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
    leaveSession,
  };
}
