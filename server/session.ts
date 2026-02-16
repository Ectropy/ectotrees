import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { WorldStates, WorldState } from '../shared/types.ts';
import type { ServerMessage } from '../shared/protocol.ts';
import { applyTransitions } from '../shared/mutations.ts';

const MAX_SESSIONS = 50;
const MAX_CLIENTS_PER_SESSION = 20;
const SESSION_INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 hours
const EMPTY_SESSION_TTL_MS = 30 * 60 * 1000;       // 30 minutes
const TRANSITION_INTERVAL_MS = 10_000;              // 10 seconds

export interface Session {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  emptySince: number | null;
  worldStates: WorldStates;
  clients: Set<WebSocket>;
  transitionTimer: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, Session>();

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
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
  broadcast(session, { type: 'clientCount', count: session.clients.size });
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
    transitionTimer: setInterval(() => {
      const s = sessions.get(code);
      if (!s) return;
      const prev = s.worldStates;
      const next = applyTransitions(prev, Date.now());
      if (next !== prev) {
        // Find which worlds changed and broadcast individual updates
        for (const key of Object.keys(next)) {
          const id = Number(key);
          if (next[id] !== prev[id]) {
            broadcast(s, { type: 'worldUpdate', worldId: id, state: next[id] });
          }
        }
        // Check for worlds that were removed (dead → none clears to { treeStatus: 'none' })
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

export function addClient(session: Session, ws: WebSocket): boolean {
  if (session.clients.size >= MAX_CLIENTS_PER_SESSION) {
    return false;
  }
  session.clients.add(ws);
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
  return true;
}

export function removeClient(session: Session, ws: WebSocket) {
  session.clients.delete(ws);
  if (session.clients.size === 0) {
    session.emptySince = Date.now();
  }
  broadcastClientCount(session);
}

export function updateWorldState(
  session: Session,
  worldId: number,
  state: WorldState | null,
) {
  session.lastActivityAt = Date.now();
  if (state === null) {
    delete session.worldStates[worldId];
  } else {
    session.worldStates[worldId] = state;
  }
  broadcast(session, { type: 'worldUpdate', worldId, state });
}

function destroySession(session: Session) {
  clearInterval(session.transitionTimer);
  for (const ws of session.clients) {
    const msg: ServerMessage = { type: 'sessionClosed', reason: 'Session expired due to inactivity.' };
    ws.send(JSON.stringify(msg));
    ws.close();
  }
  sessions.delete(session.code);
}

export function cleanupExpiredSessions() {
  const now = Date.now();
  for (const session of sessions.values()) {
    const inactiveExpired = now - session.lastActivityAt > SESSION_INACTIVITY_MS;
    const emptyExpired = session.emptySince !== null && now - session.emptySince > EMPTY_SESSION_TTL_MS;
    if (inactiveExpired || emptyExpired) {
      destroySession(session);
    }
  }
}

export function getSessionCount(): number {
  return sessions.size;
}
