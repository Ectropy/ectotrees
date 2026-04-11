import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { WorldStates, WorldState } from '../types';
import type { ClientMessage, ServerMessage, MemberInfo, MemberRole } from '../../shared/protocol.ts';
import { validateSessionCode } from '../lib/sessionUrl';
import { RECONNECT_DELAYS, MAX_RECONNECT_ATTEMPTS } from '../../shared/reconnect.ts';

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
  identityViewers: number;
  anonymousViewers: number;
  error: string | null;
  errorKind: 'connection' | 'application' | null;
  reconnectAttempt: number;
  reconnectAt: number | null;  // ms timestamp when next retry fires; null while not waiting
  recentOwnWorldId: number | null;
  // Identity token (uniquely identifies this user for auth, scout linking, and attribution)
  identityToken: string | null;
  scoutConnected: boolean;          // true when a peerWorld message has been received since last connect
  scoutWorld: number | null;        // world the linked scout is currently on (via peerWorld)
  // Managed session
  managed: boolean;
  allowOpenJoin: boolean;
  memberName: string | null;
  memberRole: MemberRole | null;
  members: MemberInfo[];
  lastInvite: { identityToken: string; name: string; link: string } | null;
  forkInvite: { managedCode: string; inviteLink: string; initiatorName: string; expiresAt: number; selfRegisterToken?: string; identityToken?: string } | null;
  sessionName: string | null;
  sessionDescription: string | null;
  sessionListed: boolean;
}

const API_BASE = resolveApiBase();
const WS_BASE = resolveWsBase();
const PING_INTERVAL_MS = 30_000;
const PING_ACK_TIMEOUT_MS = 8_000;  // force-close if pong not received within this window after a ping
export { MAX_RECONNECT_ATTEMPTS };
const ACK_TIMEOUT_MS = 5_000;
const SESSION_CODE_STORAGE_KEY = 'evilTree_sessionCode';
const IDENTITY_TOKEN_STORAGE_KEY = 'evilTree_identityToken';

const FATAL_ERRORS = new Set(['Session is full.', 'Session not found.', 'This is a private session. You need an invite link to join.', 'Invalid identity token.']);

function defaultSessionState(overrides?: Partial<SessionState>): SessionState {
  return {
    status: 'disconnected', code: null, clientCount: 0, scouts: 0, dashboards: 0, identityViewers: 0, anonymousViewers: 0,
    error: null, errorKind: null, reconnectAttempt: 0, reconnectAt: null,
    recentOwnWorldId: null,
    identityToken: null, scoutConnected: false, scoutWorld: null,
    managed: false, allowOpenJoin: false, memberName: null, memberRole: null, members: [], lastInvite: null, forkInvite: null,
    sessionName: null, sessionDescription: null, sessionListed: false,
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

function loadPersistedIdentityToken(): string | null {
  try {
    return localStorage.getItem(IDENTITY_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function persistIdentityToken(token: string | null) {
  try {
    if (token) localStorage.setItem(IDENTITY_TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(IDENTITY_TOKEN_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function useSession(onSessionLost?: () => void) {
  const initialCode = loadPersistedSessionCode();
  const [session, setSession] = useState<SessionState>(defaultSessionState({ code: initialCode }));
  const [previewWorlds, setPreviewWorlds] = useState<WorldStates | null>(null);
  const [dismissedForkCode, setDismissedForkCode] = useState<string | null>(null);

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
  const identityTokenRef = useRef<string | null>(loadPersistedIdentityToken());

  const recentOwnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestTokenAfterConnectRef = useRef(false);
  const selfRegisterResolveRef = useRef<{ resolve: (token: string) => void; reject: (err: Error) => void } | null>(null);

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

  function connectWs(code: string | null, identityToken?: string) {
    // Prevent the old WS's onclose from scheduling a duplicate reconnect
    intentionalCloseRef.current = true;
    cleanup();
    intentionalCloseRef.current = false;

    snapshotReceivedRef.current = false;
    setSession(prev => ({ ...prev, status: 'connecting', error: null, errorKind: null, scoutConnected: false, scoutWorld: null }));

    const ws = new WebSocket(`${WS_BASE}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      reconnectAttemptRef.current = 0;
      lastServerErrorRef.current = null;
      setSession(prev => ({ ...prev, status: 'connected', error: null, errorKind: null, reconnectAttempt: 0, reconnectAt: null }));

      // Send auth message first
      if (identityToken) {
        ws.send(JSON.stringify({ type: 'authIdentity', token: identityToken }));
      } else if (code) {
        ws.send(JSON.stringify({ type: 'authSession', code }));
      }

      // Auto-request personal token if flagged (e.g. "Link with Alt1" flow)
      if (requestTokenAfterConnectRef.current) {
        requestTokenAfterConnectRef.current = false;
        ws.send(JSON.stringify({ type: 'requestIdentityToken' }));
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
          // Server tells us if this is a managed session — anonymous viewers need this to
          // correctly derive canEdit=false without waiting for an identity message
          if (msg.managed) {
            setSession(prev => ({ ...prev, managed: true }));
          }
          // Identify as a dashboard
          ws.send(JSON.stringify({ type: 'identify', clientType: 'dashboard' }));

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
          // Clear a bad identity token so it isn't replayed on reload
          if (identityTokenRef.current) {
            identityTokenRef.current = null;
            persistIdentityToken(null);
          }
          if (FATAL_ERRORS.has(msg.reason)) {
            // Session is permanently gone — clear code so we don't retry it on reload
            codeRef.current = null;
            persistSessionCode(null);
            clearPending();
            setSession(defaultSessionState({ error: msg.reason, errorKind: 'application' }));
          } else {
            setSession(prev => ({ ...prev, error: msg.reason, errorKind: 'application', status: 'disconnected', reconnectAttempt: 0, reconnectAt: null }));
          }
          ws.close();
          break;

        case 'snapshot': {
          let worlds: WorldStates;
          let toContribute: WorldStates | null = null;

          if (initialStatesRef.current) {
            // Creating a session: seed with local state (local wins over empty snapshot)
            worlds = { ...msg.worlds, ...initialStatesRef.current };
            // Send to server so other clients receive the initial state
            ws.send(JSON.stringify({ type: 'initializeState', worlds: initialStatesRef.current }));
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
        case 'worldUpdate': {
          handlersRef.current?.onWorldUpdate(msg.worldId, msg.state);
          const isOwn = msg.ownUpdate;
          if (isOwn) {
            if (recentOwnTimerRef.current) clearTimeout(recentOwnTimerRef.current);
            setSession(prev => ({ ...prev, recentOwnWorldId: msg.worldId }));
            recentOwnTimerRef.current = setTimeout(() => {
              setSession(prev => ({ ...prev, recentOwnWorldId: null }));
            }, 3000);
          }
          break;
        }
        case 'peerWorld':
          setSession(prev => ({ ...prev, scoutWorld: msg.worldId }));
          break;
        case 'peerScout':
          setSession(prev => ({ ...prev, scoutConnected: msg.connected, ...(msg.connected ? {} : { scoutWorld: null }) }));
          break;
        case 'identity':
          setSession(prev => ({ ...prev, memberName: msg.name, memberRole: msg.role, identityToken: identityTokenRef.current }));
          break;
        case 'managedEnabled':
          identityTokenRef.current = msg.identityToken;
          persistIdentityToken(msg.identityToken);
          setSession(prev => ({ ...prev, managed: true, identityToken: msg.identityToken }));
          break;
        case 'forkInvite':
          setSession(prev => ({ ...prev, forkInvite: { managedCode: msg.managedCode, inviteLink: msg.inviteLink, initiatorName: msg.initiatorName, expiresAt: msg.expiresAt, selfRegisterToken: msg.selfRegisterToken, identityToken: msg.identityToken } }));
          setDismissedForkCode(prev => prev === msg.managedCode ? prev : null);
          break;
        case 'forkInviteExpired':
          setSession(prev => ({ ...prev, forkInvite: null }));
          setDismissedForkCode(null);
          break;
        case 'forkCreated': {
          // Initiator joins the new managed session as owner via identity token
          const { managedCode, identityToken: token } = msg;
          codeRef.current = managedCode;
          persistSessionCode(managedCode);
          identityTokenRef.current = token;
          persistIdentityToken(token);
          clearPending();
          setSession(prev => ({ ...defaultSessionState(), code: managedCode, status: prev.status }));
          connectWs(managedCode, token);
          break;
        }
        case 'inviteCreated':
          setSession(prev => ({ ...prev, lastInvite: { identityToken: msg.identityToken, name: msg.name, link: msg.link } }));
          break;
        case 'memberList':
          setSession(prev => ({ ...prev, members: msg.members }));
          break;
        case 'allowOpenJoin':
          setSession(prev => ({ ...prev, allowOpenJoin: msg.allow }));
          break;
        case 'sessionSettingsUpdated':
          setSession(prev => ({ ...prev, sessionName: msg.name, sessionDescription: msg.description ?? null, sessionListed: msg.listed }));
          break;
        case 'identityToken':
          identityTokenRef.current = msg.token;
          persistIdentityToken(msg.token);
          setSession(prev => ({ ...prev, identityToken: msg.token }));
          break;
        case 'selfRegistered':
          if (selfRegisterResolveRef.current) {
            const { resolve } = selfRegisterResolveRef.current;
            selfRegisterResolveRef.current = null;
            resolve(msg.identityToken);
          }
          break;
        case 'redirect': {
          // Server is telling us to switch to a different session (fork migration)
          const newCode = msg.code;
          const token = identityTokenRef.current;
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
        case 'kicked':
          intentionalCloseRef.current = true;
          clearPending();
          setSession(prev => ({ ...prev, status: 'disconnected', error: 'You were kicked from the session.', errorKind: 'application' }));
          break;
        case 'banned':
          intentionalCloseRef.current = true;
          cleanup();
          codeRef.current = null;
          persistSessionCode(null);
          clearPending();
          setSession(defaultSessionState({ error: msg.reason, errorKind: 'application' }));
          break;
        case 'clientCount':
          setSession(prev => ({ ...prev, clientCount: msg.count, scouts: msg.scouts, dashboards: msg.dashboards, identityViewers: msg.identityViewers, anonymousViewers: msg.anonymousViewers }));
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
          if (selfRegisterResolveRef.current) {
            const { reject } = selfRegisterResolveRef.current;
            selfRegisterResolveRef.current = null;
            reject(new Error(msg.message));
          }
          if (msg.serverVersion && msg.serverVersion !== __APP_VERSION__) {
            console.warn(
              `[ectotrees] Version mismatch — client: ${__APP_VERSION__}, server: ${msg.serverVersion}\n` +
              `Protocol files differ. Restart both dev server and client, or hard-refresh in production.`
            );
          }
          // Treat server error as a nack — discard pending mutations so
          // their ACK timers don't fire and force-close the connection.
          clearPending();
          lastServerErrorRef.current = msg.message;
          setSession(prev => ({ ...prev, error: msg.message, errorKind: 'application' }));
          break;
        case 'sessionClosed':
          intentionalCloseRef.current = true;
          onSessionLostRef.current?.();
          cleanup();
          codeRef.current = null;
          clearPending();
          setSession(defaultSessionState({ error: msg.reason, errorKind: 'application' }));
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
          error: fatalMessage, errorKind: 'application',
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
          error: 'Unable to reconnect.', errorKind: 'connection',
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
        if (codeRef.current || identityTokenRef.current) {
          connectWs(codeRef.current, identityTokenRef.current ?? undefined);
        }
      }, delay);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      // onclose will fire after this
    };
  }

  const createSession = useCallback(async (initialStates?: WorldStates): Promise<string | null> => {
    setSession(prev => ({ ...prev, error: null, errorKind: null }));
    try {
      const res = await fetch(`${API_BASE}/session`, { method: 'POST', headers: { 'X-Requested-With': 'fetch' } });
      const data = await res.json();
      if (!res.ok) {
        setSession(prev => ({ ...prev, error: data.error ?? 'Failed to create session.', errorKind: 'application' }));
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
      setSession(prev => ({ ...prev, error: 'Network error creating session.', errorKind: 'application' }));
      return null;
    }
  }, []);

  const createSessionAndRequestToken = useCallback(async (initialStates?: WorldStates): Promise<string | null> => {
    requestTokenAfterConnectRef.current = true;
    const code = await createSession(initialStates);
    if (!code) requestTokenAfterConnectRef.current = false;
    return code;
  }, [createSession]);

  const joinSession = useCallback((code: string, localStates?: WorldStates): boolean => {
    if (!validateSessionCode(code)) {
      setSession(prev => ({ ...prev, error: 'Invalid session code.', errorKind: 'application' }));
      return false;
    }
    setSession(prev => ({ ...prev, error: null, errorKind: null }));
    joinMergeStatesRef.current = localStates ?? null;
    codeRef.current = code;
    persistSessionCode(code);
    clearPending();
    setSession(prev => ({ ...prev, code, reconnectAttempt: 0 }));
    connectWs(code);
    return true;
  }, []);

  const joinByIdentityToken = useCallback((token: string): void => {
    identityTokenRef.current = token;
    persistIdentityToken(token);
    setSession(prev => ({ ...prev, error: null, errorKind: null, reconnectAttempt: 0 }));
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
    identityTokenRef.current = null;
    persistIdentityToken(null);
    reconnectAttemptRef.current = 0;
    clearPending();
    setSession(defaultSessionState());
  }, []);

  const rejoinSession = useCallback((code: string): void => {
    reconnectAttemptRef.current = 0;
    codeRef.current = code;
    persistSessionCode(code);
    clearPending();
    setSession(prev => ({ ...prev, code, error: null, errorKind: null, reconnectAttempt: 0 }));
    // Use the invite token if available so managed-session members rejoin as themselves,
    // not as anonymous viewers (which would leave member.connections empty on the server).
    connectWs(code, identityTokenRef.current ?? undefined);
  }, []);

  const previewJoin = useCallback((codeOrToken: string): Promise<WorldStates | null> => {
    // Cancel any in-flight preview
    if (previewWsRef.current) {
      previewWsRef.current.close();
      previewWsRef.current = null;
    }
    if (previewResolveRef.current) {
      previewResolveRef.current(null);
      previewResolveRef.current = null;
    }

    setSession(prev => ({ ...prev, error: null, errorKind: null }));

    return new Promise<WorldStates | null>((resolve) => {
      previewResolveRef.current = resolve;

      const ws = new WebSocket(`${WS_BASE}/ws`);
      previewWsRef.current = ws;

      ws.onopen = () => {
        // Determine if it's a code (6 chars) or token (12 chars)
        const isToken = codeOrToken.length === 12;
        const msg = isToken
          ? { type: 'authIdentity' as const, token: codeOrToken }
          : { type: 'authSession' as const, code: codeOrToken };
        ws.send(JSON.stringify(msg));
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
          setSession(prev => ({ ...prev, error: msg.message, errorKind: 'application' }));
          // onclose fires next and will resolve null
        } else if (msg.type === 'authError') {
          lastServerErrorRef.current = msg.reason;
          setSession(prev => ({ ...prev, error: msg.reason, errorKind: 'application' }));
          // Resolve immediately — don't wait for onclose (which may race with the message)
          previewWsRef.current = null;
          const res = previewResolveRef.current;
          previewResolveRef.current = null;
          ws.close();
          res?.(null);
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

  const confirmPreviewJoin = useCallback((codeOrToken: string, localStates?: WorldStates): void => {
    const previewWs = previewWsRef.current;
    previewWsRef.current = null;
    previewResolveRef.current = null;
    setPreviewWorlds(null);

    // Determine if it's a code (6 chars) or token (12 chars)
    const isToken = codeOrToken.length === 12;

    // The existing snapshot handler applies merge + contributeWorlds via joinMergeStatesRef
    joinMergeStatesRef.current = localStates ?? null;
    clearPending();
    setSession(prev => ({ ...prev, reconnectAttempt: 0, error: null, errorKind: null }));

    if (isToken) {
      // For identity tokens
      identityTokenRef.current = codeOrToken;
      persistIdentityToken(codeOrToken);
    } else {
      // For session codes
      codeRef.current = codeOrToken;
      persistSessionCode(codeOrToken);
      setSession(prev => ({ ...prev, code: codeOrToken }));
    }

    // Wait for preview WS to close so the server frees the slot before we reconnect
    if (previewWs && previewWs.readyState !== WebSocket.CLOSED) {
      previewWs.onclose = () => { connectWs(isToken ? null : codeOrToken, isToken ? codeOrToken : undefined); };
      previewWs.onmessage = null;
      previewWs.onerror = null;
      previewWs.close();
    } else {
      connectWs(isToken ? null : codeOrToken, isToken ? codeOrToken : undefined);
    }
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

    if (ws && ws.readyState === WebSocket.OPEN && snapshotReceivedRef.current) {
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
    setSession(prev => ({ ...prev, error: null, errorKind: null }));
  }, []);

  const forkToManaged = useCallback((name: string) => {
    sendWsMessage({ type: 'forkToManaged', name });
  }, []);

  const joinManagedFork = useCallback(async (managedCode: string, name: string, selfRegisterToken: string, identityToken?: string): Promise<void> => {
    setSession(prev => ({ ...prev, error: null, errorKind: null }));
    try {
      const token = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          selfRegisterResolveRef.current = null;
          reject(new Error('Self-registration timed out.'));
        }, 10_000);
        selfRegisterResolveRef.current = {
          resolve: (t) => { clearTimeout(timer); resolve(t); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        };
        sendWsMessage({ type: 'selfRegister', name, selfRegisterToken, identityToken });
      });
      identityTokenRef.current = token;
      persistIdentityToken(token);
      codeRef.current = managedCode;
      persistSessionCode(managedCode);
      clearPending();
      setSession(prev => ({ ...defaultSessionState(), code: managedCode, status: prev.status }));
      connectWs(managedCode, token);
    } catch (err) {
      setSession(prev => ({ ...prev, error: err instanceof Error ? err.message : 'Failed to join managed session.', errorKind: 'application' }));
    }
  }, []);

  const createInviteAction = useCallback((name: string, role?: 'scout' | 'viewer') => {
    sendWsMessage({ type: 'createInvite', name, role });
  }, []);

  const kickMemberAction = useCallback((identityToken: string) => {
    sendWsMessage({ type: 'kickMember', identityToken });
  }, []);

  const banMemberAction = useCallback((identityToken: string) => {
    sendWsMessage({ type: 'banMember', identityToken });
  }, []);

  const renameMemberAction = useCallback((identityToken: string, name: string) => {
    sendWsMessage({ type: 'renameMember', identityToken, name });
  }, []);

  const setMemberRoleAction = useCallback((identityToken: string, role: 'moderator' | 'scout' | 'viewer') => {
    sendWsMessage({ type: 'setMemberRole', identityToken, role });
  }, []);

  const transferOwnershipAction = useCallback((identityToken: string) => {
    sendWsMessage({ type: 'transferOwnership', identityToken });
  }, []);

  const setAllowOpenJoinAction = useCallback((allow: boolean) => {
    sendWsMessage({ type: 'setAllowOpenJoin', allow });
  }, []);

  const openJoin = useCallback(async (code: string, name: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/session/${encodeURIComponent(code)}/open-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSession(prev => ({ ...prev, error: data.error ?? 'Failed to join session.' }));
        return false;
      }
      joinByIdentityToken(data.identityToken as string);
      return true;
    } catch {
      setSession(prev => ({ ...prev, error: 'Network error. Please try again.' }));
      return false;
    }
  }, [joinByIdentityToken]);

  const updateSessionSettingsAction = useCallback((settings: { name?: string; description?: string; listed?: boolean }) => {
    sendWsMessage({ type: 'updateSessionSettings', settings });
  }, []);

  const requestIdentityTokenAction = useCallback(() => {
    sendWsMessage({ type: 'requestIdentityToken' });
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
    if ((codeRef.current || identityTokenRef.current) && session.status === 'disconnected') {
      connectWs(codeRef.current, identityTokenRef.current ?? undefined);
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
    createSessionAndRequestToken,
    joinSession,
    joinByIdentityToken,
    rejoinSession,
    leaveSession,
    previewJoin,
    confirmPreviewJoin,
    cancelPreview,
    dismissError,
    forkToManaged,
    joinManagedFork,
    createInvite: createInviteAction,
    kickMember: kickMemberAction,
    banMember: banMemberAction,
    renameMember: renameMemberAction,
    setMemberRole: setMemberRoleAction,
    transferOwnership: transferOwnershipAction,
    setAllowOpenJoin: setAllowOpenJoinAction,
    openJoin,
    updateSessionSettings: updateSessionSettingsAction,
    requestIdentityToken: requestIdentityTokenAction,
    forkDismissed: dismissedForkCode !== null && session.forkInvite?.managedCode === dismissedForkCode,
    dismissForkInvite: () => setDismissedForkCode(session.forkInvite?.managedCode ?? null),
  };
}
