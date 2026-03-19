import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { WorldStates, WorldState } from '../types';
import type { ClientMessage, ServerMessage, MemberInfo, MemberRole } from '../../shared/protocol.ts';
import { validateSessionCode } from '../lib/sessionUrl';

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
  scouts: number;
  dashboards: number;
  error: string | null;
  reconnectAttempt: number;
  reconnectAt: number | null;  // ms timestamp when next retry fires; null while not waiting
  recentOwnWorldId: number | null;
  // Personal token (unified identity for dashboard + scout linking)
  personalToken: string | null;
  scoutWorld: number | null;        // world the linked scout is currently on (via peerWorld)
  // Managed session
  managed: boolean;
  ownerToken: string | null;
  allowViewers: boolean;
  memberName: string | null;
  memberRole: MemberRole | null;
  members: MemberInfo[];
  lastInvite: { inviteToken: string; name: string; link: string } | null;
  forkInvite: { managedCode: string; inviteLink: string; initiatorName: string; expiresAt: number; selfRegisterToken?: string; personalToken?: string } | null;
}

const API_BASE = resolveApiBase();
const WS_BASE = resolveWsBase();
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30_000;
const PING_ACK_TIMEOUT_MS = 8_000;  // force-close if pong not received within this window after a ping
export const MAX_RECONNECT_ATTEMPTS = 10;
const ACK_TIMEOUT_MS = 5_000;
const SESSION_CODE_STORAGE_KEY = 'evilTree_sessionCode';
const INVITE_TOKEN_STORAGE_KEY = 'evilTree_inviteToken';

const FATAL_ERRORS = new Set(['Session is full.', 'Session not found.', 'This is a private session. You need an invite link to join.']);

function defaultSessionState(overrides?: Partial<SessionState>): SessionState {
  return {
    status: 'disconnected', code: null, clientCount: 0, scouts: 0, dashboards: 0,
    error: null, reconnectAttempt: 0, reconnectAt: null,
    recentOwnWorldId: null,
    personalToken: null, scoutWorld: null,
    managed: false, ownerToken: null, allowViewers: false, memberName: null, memberRole: null, members: [], lastInvite: null, forkInvite: null,
    ...overrides,
  };
}

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
    return validateSessionCode(code) ? code : null;
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

function loadPersistedInviteToken(): string | null {
  try {
    return localStorage.getItem(INVITE_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function persistInviteToken(token: string | null) {
  try {
    if (token) localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(INVITE_TOKEN_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function useSession(onSessionLost?: () => void) {
  const initialCode = loadPersistedSessionCode();
  const [session, setSession] = useState<SessionState>(defaultSessionState({ code: initialCode }));
  const [previewWorlds, setPreviewWorlds] = useState<WorldStates | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const previewWsRef = useRef<WebSocket | null>(null);
  const previewResolveRef = useRef<((worlds: WorldStates | null) => void) | null>(null);
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
  const joinMergeStatesRef = useRef<WorldStates | null>(null);
  const msgIdCounterRef = useRef(1);
  const pendingMutationsRef = useRef<Map<number, PendingMutation>>(new Map());
  const inviteTokenRef = useRef<string | null>(loadPersistedInviteToken());
  const personalTokenRef = useRef<string | null>(null);
  const recentOwnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onSessionLostRef.current = onSessionLost;
  }, [onSessionLost]);

  function sendWsMessage(msg: ClientMessage) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

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

  function connectWs(code: string | null, inviteToken?: string) {
    // Prevent the old WS's onclose from scheduling a duplicate reconnect
    intentionalCloseRef.current = true;
    cleanup();
    intentionalCloseRef.current = false;

    snapshotReceivedRef.current = false;
    setSession(prev => ({ ...prev, status: 'connecting', error: null }));

    const ws = new WebSocket(`${WS_BASE}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      reconnectAttemptRef.current = 0;
      lastServerErrorRef.current = null;
      setSession(prev => ({ ...prev, status: 'connected', error: null, reconnectAttempt: 0, reconnectAt: null }));

      // Send auth message first
      if (inviteToken) {
        ws.send(JSON.stringify({ type: 'authInvite', token: inviteToken }));
      } else if (code) {
        ws.send(JSON.stringify({ type: 'authSession', code }));
      }
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
        case 'authSuccess':
          // Server tells us the confirmed session code (critical when joining via invite token)
          if (msg.sessionCode && msg.sessionCode !== codeRef.current) {
            codeRef.current = msg.sessionCode;
            persistSessionCode(msg.sessionCode);
            setSession(prev => ({ ...prev, code: msg.sessionCode }));
          }
          // Identify as a dashboard
          ws.send(JSON.stringify({ type: 'identify', clientType: 'dashboard' }));

          // Send local state to populate a newly created session
          if (initialStatesRef.current) {
            ws.send(JSON.stringify({ type: 'initializeState', worlds: initialStatesRef.current }));
            initialStatesRef.current = null;
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
          break;

        case 'authError':
          lastServerErrorRef.current = msg.reason;
          intentionalCloseRef.current = true;
          // Clear a bad invite token so it isn't replayed on reload
          if (inviteTokenRef.current) {
            inviteTokenRef.current = null;
            persistInviteToken(null);
          }
          setSession(prev => ({ ...prev, error: msg.reason, status: 'disconnected', reconnectAttempt: 0, reconnectAt: null }));
          ws.close();
          break;

        case 'snapshot': {
          let worlds: WorldStates;
          let toContribute: WorldStates | null = null;

          if (initialStatesRef.current) {
            // Creating a session: seed with local state (local wins over empty snapshot)
            worlds = { ...msg.worlds, ...initialStatesRef.current };
            initialStatesRef.current = null;
          } else if (joinMergeStatesRef.current) {
            // Joining with local data: server wins conflicts, local fills gaps
            const local = joinMergeStatesRef.current;
            joinMergeStatesRef.current = null;
            worlds = { ...local, ...msg.worlds };
            // Find local-only active worlds to contribute to the session
            const localOnly = Object.fromEntries(
              Object.entries(local).filter(
                ([id, s]) =>
                  (s.treeStatus !== 'none' || s.nextSpawnTarget !== undefined) &&
                  !(Number(id) in msg.worlds)
              )
            ) as WorldStates;
            if (Object.keys(localOnly).length > 0) {
              toContribute = localOnly;
            }
          } else {
            worlds = msg.worlds;
          }

          if (handlersRef.current) {
            handlersRef.current.onSnapshot(worlds);
          } else {
            pendingSnapshotRef.current = worlds;
          }
          snapshotReceivedRef.current = true;
          replayPendingMutations();
          // Contribute after replay so it isn't caught up in the replay sweep
          if (toContribute) {
            sendMutation({ type: 'contributeWorlds', worlds: toContribute });
          }
          break;
        }
        case 'worldUpdate':
          handlersRef.current?.onWorldUpdate(msg.worldId, msg.state);
          // Own submission: scout's mutation that arrives at our dashboard with source attribution
          if (msg.source && msg.source === personalTokenRef.current) {
            if (recentOwnTimerRef.current) clearTimeout(recentOwnTimerRef.current);
            setSession(prev => ({ ...prev, recentOwnWorldId: msg.worldId }));
            recentOwnTimerRef.current = setTimeout(() => {
              setSession(prev => ({ ...prev, recentOwnWorldId: null }));
            }, 3000);
          }
          break;
        case 'peerWorld':
          setSession(prev => ({ ...prev, scoutWorld: msg.worldId }));
          break;
        case 'identity': {
          // In managed sessions, the invite token is the personal token
          const pt = inviteTokenRef.current;
          if (pt) personalTokenRef.current = pt;
          setSession(prev => ({ ...prev, managed: true, memberName: msg.name, memberRole: msg.role, personalToken: pt }));
          break;
        }
        case 'managedEnabled':
          inviteTokenRef.current = msg.ownerToken;
          persistInviteToken(msg.ownerToken);
          setSession(prev => ({ ...prev, managed: true, ownerToken: msg.ownerToken }));
          break;
        case 'forkInvite':
          setSession(prev => ({ ...prev, forkInvite: { managedCode: msg.managedCode, inviteLink: msg.inviteLink, initiatorName: msg.initiatorName, expiresAt: msg.expiresAt, selfRegisterToken: msg.selfRegisterToken, personalToken: msg.personalToken } }));
          break;
        case 'forkInviteExpired':
          setSession(prev => ({ ...prev, forkInvite: null }));
          break;
        case 'forkCreated': {
          // Initiator joins the new managed session as owner via invite token
          const { managedCode, ownerToken } = msg;
          codeRef.current = managedCode;
          persistSessionCode(managedCode);
          // Persist ownerToken so identity handler picks it up as personalToken
          inviteTokenRef.current = ownerToken;
          persistInviteToken(ownerToken);
          clearPending();
          setSession(prev => ({ ...defaultSessionState(), code: managedCode, status: prev.status }));
          connectWs(managedCode, ownerToken);
          break;
        }
        case 'inviteCreated':
          setSession(prev => ({ ...prev, lastInvite: { inviteToken: msg.inviteToken, name: msg.name, link: msg.link } }));
          break;
        case 'memberList':
          setSession(prev => ({ ...prev, members: msg.members }));
          break;
        case 'allowViewers':
          setSession(prev => ({ ...prev, allowViewers: msg.allow }));
          break;
        case 'personalToken':
          personalTokenRef.current = msg.token;
          setSession(prev => ({ ...prev, personalToken: msg.token }));
          break;
        case 'redirect': {
          // Server is telling us to switch to a different session (fork migration)
          const newCode = msg.code;
          const token = inviteTokenRef.current ?? personalTokenRef.current;
          codeRef.current = newCode;
          persistSessionCode(newCode);
          clearPending();
          setSession(prev => ({ ...defaultSessionState(), code: newCode, status: prev.status }));
          connectWs(newCode, token ?? undefined);
          break;
        }
        case 'memberJoined':
        case 'memberLeft':
          // These are informational — memberList broadcast follows and updates state
          break;
        case 'banned':
          intentionalCloseRef.current = true;
          cleanup();
          codeRef.current = null;
          persistSessionCode(null);
          clearPending();
          setSession(defaultSessionState({ error: msg.reason }));
          break;
        case 'clientCount':
          setSession(prev => ({ ...prev, clientCount: msg.count, scouts: msg.scouts, dashboards: msg.dashboards }));
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
          if (msg.serverVersion && msg.serverVersion !== __APP_VERSION__) {
            console.warn(
              `[ectotrees] Version mismatch — client: ${__APP_VERSION__}, server: ${msg.serverVersion}\n` +
              `Protocol files differ. Restart both dev server and client, or hard-refresh in production.`
            );
          }
          lastServerErrorRef.current = msg.message;
          setSession(prev => ({ ...prev, error: msg.message }));
          break;
        case 'sessionClosed':
          intentionalCloseRef.current = true;
          onSessionLostRef.current?.();
          cleanup();
          codeRef.current = null;
          clearPending();
          setSession(defaultSessionState({ error: msg.reason }));
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
        const fatalMessage = lastServerErrorRef.current;
        codeRef.current = null;
        persistSessionCode(null);
        clearPending();
        setSession(prev => ({
          ...prev,
          status: 'disconnected',
          code: null,
          error: fatalMessage,
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
        if (codeRef.current || inviteTokenRef.current) {
          connectWs(codeRef.current, inviteTokenRef.current ?? undefined);
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

  const joinSession = useCallback((code: string, localStates?: WorldStates): boolean => {
    if (!validateSessionCode(code)) {
      setSession(prev => ({ ...prev, error: 'Invalid session code.' }));
      return false;
    }
    setSession(prev => ({ ...prev, error: null }));
    joinMergeStatesRef.current = localStates ?? null;
    codeRef.current = code;
    persistSessionCode(code);
    clearPending();
    setSession(prev => ({ ...prev, code, reconnectAttempt: 0 }));
    connectWs(code);
    return true;
  }, []);

  const joinByInviteToken = useCallback((token: string): void => {
    inviteTokenRef.current = token;
    persistInviteToken(token);
    setSession(prev => ({ ...prev, error: null, reconnectAttempt: 0 }));
    clearPending();
    connectWs(null, token);
  }, []);

  const leaveSession = useCallback(() => {
    intentionalCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.close(1000, 'intentionally disconnected');
      wsRef.current = null;
    }
    cleanup();
    codeRef.current = null;
    persistSessionCode(null);
    inviteTokenRef.current = null;
    persistInviteToken(null);
    reconnectAttemptRef.current = 0;
    clearPending();
    setSession(defaultSessionState());
  }, []);

  const rejoinSession = useCallback((code: string): void => {
    reconnectAttemptRef.current = 0;
    clearPending();
    joinSession(code);
  }, [joinSession]);

  const previewJoin = useCallback((code: string): Promise<WorldStates | null> => {
    // Cancel any in-flight preview
    if (previewWsRef.current) {
      previewWsRef.current.close();
      previewWsRef.current = null;
    }
    if (previewResolveRef.current) {
      previewResolveRef.current(null);
      previewResolveRef.current = null;
    }

    setSession(prev => ({ ...prev, error: null }));

    return new Promise<WorldStates | null>((resolve) => {
      previewResolveRef.current = resolve;

      const ws = new WebSocket(`${WS_BASE}/ws`);
      previewWsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'authSession', code }));
      };

      ws.onmessage = (event) => {
        if (previewWsRef.current !== ws) return;
        let msg: ServerMessage;
        try { msg = JSON.parse(event.data as string); } catch { return; }

        if (msg.type === 'snapshot') {
          const res = previewResolveRef.current;
          previewResolveRef.current = null;
          setPreviewWorlds(msg.worlds);
          // Keep WS open — confirmPreviewJoin will close it
          res?.(msg.worlds);
        } else if (msg.type === 'worldUpdate') {
          setPreviewWorlds(prev => {
            if (!prev) return prev;
            if (msg.state === null) {
              const next = { ...prev };
              delete next[msg.worldId];
              return next;
            }
            return { ...prev, [msg.worldId]: msg.state };
          });
        } else if (msg.type === 'error') {
          lastServerErrorRef.current = msg.message;
          setSession(prev => ({ ...prev, error: msg.message }));
          // onclose fires next and will resolve null
        }
      };

      ws.onclose = () => {
        if (previewWsRef.current !== ws) return; // snapshot already resolved; close was intentional
        previewWsRef.current = null;
        const res = previewResolveRef.current;
        previewResolveRef.current = null;
        res?.(null);
      };

      ws.onerror = () => { /* onclose fires after this */ };
    });
  }, []);

  const confirmPreviewJoin = useCallback((code: string, localStates?: WorldStates): void => {
    // Close the preview WS (connectWs only cleans up wsRef, not previewWsRef)
    const previewWs = previewWsRef.current;
    previewWsRef.current = null;
    if (previewWs && previewWs.readyState !== WebSocket.CLOSED) {
      previewWs.close();
    }
    previewResolveRef.current = null;
    setPreviewWorlds(null);

    // The existing snapshot handler applies merge + contributeWorlds via joinMergeStatesRef
    joinMergeStatesRef.current = localStates ?? null;
    codeRef.current = code;
    persistSessionCode(code);
    clearPending();
    setSession(prev => ({ ...prev, code, reconnectAttempt: 0, error: null }));
    connectWs(code);
  }, []);

  const cancelPreview = useCallback((): void => {
    if (previewWsRef.current) {
      previewWsRef.current.close();
      previewWsRef.current = null;
    }
    if (previewResolveRef.current) {
      previewResolveRef.current(null);
      previewResolveRef.current = null;
    }
    setPreviewWorlds(null);
  }, []);

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

  const forkToManaged = useCallback((name: string) => {
    sendWsMessage({ type: 'forkToManaged', name });
  }, []);

  const joinManagedFork = useCallback(async (managedCode: string, name: string, selfRegisterToken: string, personalToken?: string): Promise<void> => {
    setSession(prev => ({ ...prev, error: null }));
    try {
      const res = await fetch(`${API_BASE}/session/${managedCode}/self-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, selfRegisterToken, personalToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSession(prev => ({ ...prev, error: data.error ?? 'Failed to join managed session.' }));
        return;
      }
      const inviteToken = data.inviteToken as string;
      inviteTokenRef.current = inviteToken;
      persistInviteToken(inviteToken);
      codeRef.current = managedCode;
      persistSessionCode(managedCode);
      clearPending();
      setSession(prev => ({ ...defaultSessionState(), code: managedCode, status: prev.status }));
      connectWs(managedCode, inviteToken);
    } catch {
      setSession(prev => ({ ...prev, error: 'Network error joining managed session.' }));
    }
  }, []);

  const createInviteAction = useCallback((name: string, role?: 'scout' | 'viewer') => {
    sendWsMessage({ type: 'createInvite', name, role });
  }, []);

  const banMemberAction = useCallback((inviteToken: string) => {
    sendWsMessage({ type: 'banMember', inviteToken });
  }, []);

  const renameMemberAction = useCallback((inviteToken: string, name: string) => {
    sendWsMessage({ type: 'renameMember', inviteToken, name });
  }, []);

  const setMemberRoleAction = useCallback((inviteToken: string, role: 'moderator' | 'scout' | 'viewer') => {
    sendWsMessage({ type: 'setMemberRole', inviteToken, role });
  }, []);

  const transferOwnershipAction = useCallback((inviteToken: string) => {
    sendWsMessage({ type: 'transferOwnership', inviteToken });
  }, []);

  const setAllowViewersAction = useCallback((allow: boolean) => {
    sendWsMessage({ type: 'setAllowViewers', allow });
  }, []);

  const requestPersonalTokenAction = useCallback(() => {
    sendWsMessage({ type: 'requestPersonalToken' });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      cleanup();
      previewWsRef.current?.close();
      previewWsRef.current = null;
      previewResolveRef.current?.(null);
      previewResolveRef.current = null;
    };
  }, []);

  // Resume prior session across page reloads (common on mobile radio changes).
  useEffect(() => {
    if ((codeRef.current || inviteTokenRef.current) && session.status === 'disconnected') {
      connectWs(codeRef.current, inviteTokenRef.current ?? undefined);
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncChannel: SyncChannel | null = useMemo(() => (
    session.status !== 'disconnected' ? { sendMutation, subscribe } : null
  ), [session.status, sendMutation, subscribe]);

  return {
    session,
    previewWorlds,
    syncChannel,
    createSession,
    joinSession,
    joinByInviteToken,
    rejoinSession,
    leaveSession,
    previewJoin,
    confirmPreviewJoin,
    cancelPreview,
    dismissError,
    forkToManaged,
    joinManagedFork,
    createInvite: createInviteAction,
    banMember: banMemberAction,
    renameMember: renameMemberAction,
    setMemberRole: setMemberRoleAction,
    transferOwnership: transferOwnershipAction,
    setAllowViewers: setAllowViewersAction,
    requestPersonalToken: requestPersonalTokenAction,
  };
}
