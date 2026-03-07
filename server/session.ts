import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { WorldStates, WorldState } from '../shared/types.ts';
import type { ServerMessage } from '../shared/protocol.ts';
import { applyTransitions } from '../shared/mutations.ts';
import { log, warn } from './log.ts';

const MAX_SESSIONS = 1000;
const MAX_CLIENTS_PER_SESSION = 1000;
const SESSION_INACTIVITY_MS = 24 * 60 * 60 * 1000; // 24 hours
const EMPTY_SESSION_TTL_MS = 60 * 60 * 1000;       // 60 minutes
const TRANSITION_INTERVAL_MS = 10_000;             // 10 seconds
const PAIR_TOKEN_TTL_MS = 60_000;                  // 60 seconds

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

interface PairTokenEntry {
  dashboardWs: WebSocket;
  expiresAt: number;
}

interface PairGroup {
  dashboard: WebSocket | null;
  scout: WebSocket | null;
  currentWorld: number | null;
}

export interface Session {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  emptySince: number | null;
  worldStates: WorldStates;
  clients: Set<WebSocket>;
  clientIds: Map<WebSocket, number>;
  clientTypes: Map<WebSocket, 'scout' | 'dashboard' | 'unknown'>;
  nextClientId: number;
  transitionTimer: ReturnType<typeof setInterval>;
  pairTokens: Map<string, PairTokenEntry>;
  pairs: Map<string, PairGroup>;
  wsToPairId: Map<WebSocket, string>;
}

const sessions = new Map<string, Session>();

// Global index: pair token → session code for O(1) lookup during WS upgrade
const pairTokenIndex = new Map<string, string>();

function generateCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

function generatePairToken(): string {
  let token: string;
  let attempts = 0;
  do {
    const bytes = crypto.randomBytes(4);
    token = '';
    for (let i = 0; i < 4; i++) {
      token += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    attempts++;
  } while (pairTokenIndex.has(token) && attempts < 20);
  return token;
}

function broadcast(session: Session, msg: ServerMessage) {
  const data = JSON.stringify(msg);
  for (const ws of session.clients) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data);
    }
  }
}

function broadcastClientCount(session: Session) {
  let scouts = 0, dashboards = 0;
  let users = 0;
  const pairedWs = new Set<WebSocket>();

  // Each active pair group (at least one connected member) = 1 user
  for (const pair of session.pairs.values()) {
    const dashConnected = pair.dashboard !== null && session.clients.has(pair.dashboard);
    const scoutConnected = pair.scout !== null && session.clients.has(pair.scout);
    if (dashConnected || scoutConnected) {
      users++;
      if (pair.dashboard) pairedWs.add(pair.dashboard);
      if (pair.scout) pairedWs.add(pair.scout);
    }
  }

  // Each unpaired connection = 1 user; count types for all connections
  for (const ws of session.clients) {
    const t = session.clientTypes.get(ws) ?? 'unknown';
    if (!pairedWs.has(ws)) users++;
    if (t === 'scout') scouts++;
    else if (t === 'dashboard') dashboards++;
  }

  broadcast(session, { type: 'clientCount', count: users, scouts, dashboards });
}

export function createSession(): { code: string } | { error: string } {
  if (sessions.size >= MAX_SESSIONS) {
    return { error: 'Maximum number of active sessions reached. Try again later.' };
  }

  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
  } while (sessions.has(code) && attempts < 10);

  if (sessions.has(code)) {
    return { error: 'Failed to generate unique session code. Try again.' };
  }

  const now = Date.now();
  const session: Session = {
    code,
    createdAt: now,
    lastActivityAt: now,
    emptySince: now,
    worldStates: {},
    clients: new Set(),
    clientIds: new Map(),
    clientTypes: new Map(),
    nextClientId: 1,
    pairTokens: new Map(),
    pairs: new Map(),
    wsToPairId: new Map(),
    transitionTimer: setInterval(() => {
      const s = sessions.get(code);
      if (!s) return;

      // Sweep expired pair tokens
      const now2 = Date.now();
      for (const [token, entry] of s.pairTokens) {
        if (now2 > entry.expiresAt) {
          s.pairTokens.delete(token);
          pairTokenIndex.delete(token);
        }
      }

      const prev = s.worldStates;
      const next = applyTransitions(prev, now2);
      if (next !== prev) {
        for (const key of Object.keys(next)) {
          const id = Number(key);
          if (next[id] !== prev[id]) {
            broadcast(s, { type: 'worldUpdate', worldId: id, state: next[id] });
          }
        }
        for (const key of Object.keys(prev)) {
          const id = Number(key);
          if (!(id in next)) {
            broadcast(s, { type: 'worldUpdate', worldId: id, state: null });
          }
        }
        s.worldStates = next;
      }
    }, TRANSITION_INTERVAL_MS),
  };

  sessions.set(code, session);
  return { code };
}

export function getSession(code: string): Session | undefined {
  return sessions.get(code);
}

export function addClient(session: Session, ws: WebSocket): number | false {
  if (session.clients.size >= MAX_CLIENTS_PER_SESSION) {
    return false;
  }
  const clientId = session.nextClientId++;
  session.clients.add(ws);
  session.clientIds.set(ws, clientId);
  session.clientTypes.set(ws, 'unknown');
  session.emptySince = null;

  // Send current state snapshot (only active worlds)
  const activeWorlds: WorldStates = {};
  for (const [key, state] of Object.entries(session.worldStates)) {
    if (state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined) {
      activeWorlds[Number(key)] = state;
    }
  }
  const snapshot: ServerMessage = { type: 'snapshot', worlds: activeWorlds };
  ws.send(JSON.stringify(snapshot));

  broadcastClientCount(session);
  return clientId;
}

export function getClientId(session: Session, ws: WebSocket): number | undefined {
  return session.clientIds.get(ws);
}

export function setClientType(session: Session, ws: WebSocket, type: 'scout' | 'dashboard'): void {
  session.clientTypes.set(ws, type);
  broadcastClientCount(session);
}

export function removeClient(session: Session, ws: WebSocket) {
  if (!session.clients.has(ws)) {
    return false;
  }
  session.clients.delete(ws);
  session.clientIds.delete(ws);
  session.clientTypes.delete(ws);

  // Pair cleanup: null out the disconnected slot, notify peer
  const pairId = session.wsToPairId.get(ws);
  if (pairId) {
    session.wsToPairId.delete(ws);
    const pair = session.pairs.get(pairId);
    if (pair) {
      let peerWs: WebSocket | null = null;
      if (pair.dashboard === ws) {
        pair.dashboard = null;
        peerWs = pair.scout;
      } else if (pair.scout === ws) {
        pair.scout = null;
        peerWs = pair.dashboard;
      }
      if (peerWs && session.clients.has(peerWs) && peerWs.readyState === 1) {
        const msg: ServerMessage = { type: 'unpaired', reason: 'Peer disconnected' };
        peerWs.send(JSON.stringify(msg));
      }
      // Delete pair group only when both sides are gone
      if (!pair.dashboard && !pair.scout) {
        session.pairs.delete(pairId);
      }
    }
  }

  if (session.clients.size === 0) {
    session.emptySince = Date.now();
  }
  broadcastClientCount(session);
  return true;
}

export function updateWorldState(
  session: Session,
  worldId: number,
  state: WorldState | null,
  originWs?: WebSocket,
) {
  session.lastActivityAt = Date.now();
  if (state === null) {
    delete session.worldStates[worldId];
  } else {
    session.worldStates[worldId] = state;
  }

  // If the originating WS is paired, send the paired dashboard a copy with source attribution
  if (originWs) {
    const pairId = session.wsToPairId.get(originWs);
    if (pairId) {
      const pair = session.pairs.get(pairId);
      if (pair?.dashboard && pair.dashboard !== originWs && session.clients.has(pair.dashboard) && pair.dashboard.readyState === 1) {
        pair.dashboard.send(JSON.stringify({ type: 'worldUpdate', worldId, state, source: pairId }));
        const normal = JSON.stringify({ type: 'worldUpdate', worldId, state });
        for (const ws of session.clients) {
          if (ws !== pair.dashboard && ws.readyState === 1) ws.send(normal);
        }
        return;
      }
    }
  }

  broadcast(session, { type: 'worldUpdate', worldId, state });
}

// ── Pair token management ───────────────────────────────────────────────────

export function requestPairToken(session: Session, dashboardWs: WebSocket): void {
  const token = generatePairToken();
  const expiresAt = Date.now() + PAIR_TOKEN_TTL_MS;
  session.pairTokens.set(token, { dashboardWs, expiresAt });
  pairTokenIndex.set(token, session.code);
  const msg: ServerMessage = { type: 'pairToken', token, expiresIn: PAIR_TOKEN_TTL_MS / 1000 };
  dashboardWs.send(JSON.stringify(msg));
}

/** Resolves a pair token to its session without consuming it (for the WS upgrade handler). */
export function lookupPairToken(token: string): { session: Session; dashboardWs: WebSocket } | null {
  const code = pairTokenIndex.get(token);
  if (!code) return null;
  const session = sessions.get(code);
  if (!session) return null;
  const entry = session.pairTokens.get(token);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return { session, dashboardWs: entry.dashboardWs };
}

function completePairing(session: Session, dashboardWs: WebSocket, scoutWs: WebSocket): string {
  // Clean up any prior pair for the dashboard
  const existingDashPairId = session.wsToPairId.get(dashboardWs);
  if (existingDashPairId) {
    const existing = session.pairs.get(existingDashPairId);
    if (existing) {
      if (existing.scout && existing.scout.readyState === 1) {
        existing.scout.send(JSON.stringify({ type: 'unpaired', reason: 'Dashboard re-paired' } satisfies ServerMessage));
      }
      if (existing.dashboard) session.wsToPairId.delete(existing.dashboard);
      if (existing.scout) session.wsToPairId.delete(existing.scout);
      session.pairs.delete(existingDashPairId);
    }
  }

  // Clean up any prior pair for the scout
  const existingScoutPairId = session.wsToPairId.get(scoutWs);
  if (existingScoutPairId) {
    const existing = session.pairs.get(existingScoutPairId);
    if (existing) {
      if (existing.dashboard && existing.dashboard.readyState === 1) {
        existing.dashboard.send(JSON.stringify({ type: 'unpaired', reason: 'Scout re-paired' } satisfies ServerMessage));
      }
      if (existing.dashboard) session.wsToPairId.delete(existing.dashboard);
      if (existing.scout) session.wsToPairId.delete(existing.scout);
      session.pairs.delete(existingScoutPairId);
    }
  }

  const pairId = crypto.randomUUID();
  session.pairs.set(pairId, { dashboard: dashboardWs, scout: scoutWs, currentWorld: null });
  session.wsToPairId.set(dashboardWs, pairId);
  session.wsToPairId.set(scoutWs, pairId);

  const pairedMsg: ServerMessage = { type: 'paired', pairId, sessionCode: session.code };
  const data = JSON.stringify(pairedMsg);
  if (scoutWs.readyState === 1) scoutWs.send(data);
  if (dashboardWs.readyState === 1) dashboardWs.send(data);

  broadcastClientCount(session);
  return pairId;
}

/** Consume the pair token and complete pairing. Returns pairId or null if token expired. */
export function consumeAndCompletePairing(session: Session, token: string, scoutWs: WebSocket): string | null {
  const entry = session.pairTokens.get(token);
  if (!entry || Date.now() > entry.expiresAt) return null;
  session.pairTokens.delete(token);
  pairTokenIndex.delete(token);
  return completePairing(session, entry.dashboardWs, scoutWs);
}

export function resumePair(session: Session, ws: WebSocket, pairId: string): boolean {
  const pair = session.pairs.get(pairId);
  if (!pair) return false;

  const clientType = session.clientTypes.get(ws) ?? 'unknown';
  let slotFilled = false;

  if (clientType === 'dashboard' && (pair.dashboard === null || pair.dashboard === ws)) {
    pair.dashboard = ws;
    session.wsToPairId.set(ws, pairId);
    slotFilled = true;
  } else if (clientType === 'scout' && (pair.scout === null || pair.scout === ws)) {
    pair.scout = ws;
    session.wsToPairId.set(ws, pairId);
    slotFilled = true;
  }

  if (!slotFilled) return false;

  const pairedMsg: ServerMessage = { type: 'paired', pairId, sessionCode: session.code };
  ws.send(JSON.stringify(pairedMsg));

  // Send current peerWorld to a freshly reconnected dashboard
  if (clientType === 'dashboard' && pair.scout && session.clients.has(pair.scout)) {
    const peerWorldMsg: ServerMessage = { type: 'peerWorld', worldId: pair.currentWorld };
    ws.send(JSON.stringify(peerWorldMsg));
  }

  broadcastClientCount(session);
  return true;
}

export function handleUnpair(session: Session, ws: WebSocket): void {
  const pairId = session.wsToPairId.get(ws);
  if (!pairId) return;

  const pair = session.pairs.get(pairId);
  if (!pair) return;

  if (pair.dashboard) session.wsToPairId.delete(pair.dashboard);
  if (pair.scout) session.wsToPairId.delete(pair.scout);
  session.pairs.delete(pairId);

  const peerWs = pair.dashboard === ws ? pair.scout : pair.dashboard;
  if (peerWs && session.clients.has(peerWs) && peerWs.readyState === 1) {
    const msg: ServerMessage = { type: 'unpaired', reason: 'Peer unpaired' };
    peerWs.send(JSON.stringify(msg));
  }

  broadcastClientCount(session);
}

export function handleReportWorld(session: Session, ws: WebSocket, worldId: number | null): void {
  const pairId = session.wsToPairId.get(ws);
  if (!pairId) return;

  const pair = session.pairs.get(pairId);
  if (!pair || pair.scout !== ws) return; // only scouts report their world

  pair.currentWorld = worldId;

  if (pair.dashboard && session.clients.has(pair.dashboard) && pair.dashboard.readyState === 1) {
    const msg: ServerMessage = { type: 'peerWorld', worldId };
    pair.dashboard.send(JSON.stringify(msg));
  }
}

// ── Session lifecycle ───────────────────────────────────────────────────────

function destroySession(session: Session, closeReason: string) {
  clearInterval(session.transitionTimer);

  // Clean up global pair token index for this session's tokens
  for (const token of session.pairTokens.keys()) {
    pairTokenIndex.delete(token);
  }

  for (const ws of session.clients) {
    const clientId = session.clientIds.get(ws) ?? '?';
    const msg: ServerMessage = { type: 'sessionClosed', reason: closeReason };
    ws.send(JSON.stringify(msg));
    ws.close(1001, closeReason);
    const forceCloseTimer = setTimeout(() => {
      if (ws.readyState !== 3) { // WebSocket.CLOSED
        warn(`[session] Force-terminating client ${clientId} in ${session.code} after close timeout`);
        ws.terminate();
      }
    }, 5_000);
    ws.once('close', () => {
      clearTimeout(forceCloseTimer);
    });
  }
  sessions.delete(session.code);
}

export function cleanupExpiredSessions() {
  const now = Date.now();
  for (const session of sessions.values()) {
    const inactiveExpired = now - session.lastActivityAt > SESSION_INACTIVITY_MS;
    const emptyExpired = session.emptySince !== null && now - session.emptySince > EMPTY_SESSION_TTL_MS;
    if (inactiveExpired || emptyExpired) {
      const closeReason = inactiveExpired ? 'inactive 24h' : 'empty 60min';
      const clientCount = session.clients.size;
      destroySession(session, inactiveExpired ? 'Session expired due to inactivity.' : `Session closed after being empty for ${EMPTY_SESSION_TTL_MS / 60_000} minutes.`);
      log(`[session] Destroyed ${session.code} — ${closeReason} (${clientCount} clients disconnected, ${getSessionCount()} sessions active)`);
    }
  }
}

export function getSessionCount(): number {
  return sessions.size;
}

export function getTotalClientCount(): number {
  let total = 0;
  for (const session of sessions.values()) total += session.clients.size;
  return total;
}
