import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { WorldStates, WorldState } from '../shared/types.ts';
import type { ServerMessage, MemberRole, MemberInfo } from '../shared/protocol.ts';
import { applyTransitions } from '../shared/mutations.ts';
import { log, warn } from './log.ts';

const APP_URL = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');

const MAX_SESSIONS = 1000;
const MAX_CLIENTS_PER_SESSION = 1000;
const MAX_MEMBERS_PER_SESSION = 500;
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

export interface Member {
  name: string;
  inviteToken: string;
  role: MemberRole;
  banned: boolean;
  connections: Set<WebSocket>;
  currentWorld: number | null;
  lastSeen: number;
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
  // Managed session fields (undefined when anonymous)
  managed?: boolean;
  ownerToken?: string;
  members?: Map<string, Member>;       // inviteToken -> Member
  wsToInviteToken?: Map<WebSocket, string>;
}

const sessions = new Map<string, Session>();

// Global index: pair token → session code for O(1) lookup during WS upgrade
const pairTokenIndex = new Map<string, string>();

// Global index: invite token → session code for O(1) lookup during WS upgrade
const inviteTokenIndex = new Map<string, string>();

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

function generateInviteToken(): string {
  let token: string;
  let attempts = 0;
  do {
    const bytes = crypto.randomBytes(12);
    token = '';
    for (let i = 0; i < 12; i++) {
      token += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    attempts++;
  } while (inviteTokenIndex.has(token) && attempts < 20);
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

  // Managed session: remove from member connections
  if (session.managed && session.wsToInviteToken && session.members) {
    const token = session.wsToInviteToken.get(ws);
    if (token) {
      session.wsToInviteToken.delete(ws);
      const member = session.members.get(token);
      if (member) {
        member.connections.delete(ws);
        member.lastSeen = Date.now();
        if (member.connections.size === 0) {
          broadcast(session, { type: 'memberLeft', name: member.name });
        }
      }
    }
  }

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
  if (session.managed) {
    broadcastManagedClientCount(session);
    broadcastMemberList(session);
  } else {
    broadcastClientCount(session);
  }
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

  // Managed session: public attribution (name + role visible to all)
  if (session.managed && originWs && session.wsToInviteToken && session.members) {
    const token = session.wsToInviteToken.get(originWs);
    if (token) {
      const member = session.members.get(token);
      if (member) {
        const source = { name: member.name, role: member.role };
        broadcast(session, { type: 'worldUpdate', worldId, state, source });
        return;
      }
    }
  }

  // Anonymous mode: If the originating WS is paired, send the paired dashboard a copy with source attribution
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

// ── Managed session (invite link system) ────────────────────────────────────

function buildMemberList(session: Session): MemberInfo[] {
  if (!session.members) return [];
  const list: MemberInfo[] = [];
  for (const member of session.members.values()) {
    if (member.banned) continue;
    list.push({
      name: member.name,
      role: member.role,
      online: member.connections.size > 0,
      currentWorld: member.currentWorld,
    });
  }
  return list;
}

function broadcastMemberList(session: Session) {
  if (!session.managed || !session.members) return;
  const baseMembers = buildMemberList(session);

  // Build admin version with invite tokens and invite links
  const adminMembers: MemberInfo[] = [];
  for (const member of session.members.values()) {
    if (member.banned) continue;
    adminMembers.push({
      name: member.name,
      role: member.role,
      online: member.connections.size > 0,
      currentWorld: member.currentWorld,
      inviteToken: member.inviteToken,
      link: `${APP_URL}/?invite=${member.inviteToken}`,
    });
  }

  const adminData = JSON.stringify({ type: 'memberList', members: adminMembers } satisfies ServerMessage);
  const normalData = JSON.stringify({ type: 'memberList', members: baseMembers } satisfies ServerMessage);

  for (const ws of session.clients) {
    if (ws.readyState !== 1) continue;
    const role = getMemberRole(session, ws);
    ws.send((role === 'owner' || role === 'moderator') ? adminData : normalData);
  }
}

function broadcastManagedClientCount(session: Session) {
  if (!session.managed || !session.members) {
    broadcastClientCount(session);
    return;
  }
  // In managed mode, count = online members (not connections)
  let onlineMembers = 0;
  let scouts = 0, dashboards = 0;
  for (const member of session.members.values()) {
    if (member.banned || member.connections.size === 0) continue;
    onlineMembers++;
    for (const ws of member.connections) {
      const t = session.clientTypes.get(ws) ?? 'unknown';
      if (t === 'scout') scouts++;
      else if (t === 'dashboard') dashboards++;
    }
  }
  // Also count anonymous viewers (connections without an invite token)
  for (const ws of session.clients) {
    if (!session.wsToInviteToken?.has(ws)) {
      onlineMembers++;
      const t = session.clientTypes.get(ws) ?? 'unknown';
      if (t === 'scout') scouts++;
      else if (t === 'dashboard') dashboards++;
    }
  }
  broadcast(session, { type: 'clientCount', count: onlineMembers, scouts, dashboards });
}

/** Enable managed mode on an existing anonymous session. Returns the owner token. */
export function enableManaged(session: Session, creatorWs: WebSocket, name: string): string | { error: string } {
  if (session.managed) return { error: 'Session is already managed.' };

  const ownerToken = generateInviteToken();
  session.managed = true;
  session.ownerToken = ownerToken;
  session.members = new Map();
  session.wsToInviteToken = new Map();

  // Create owner member entry
  const ownerMember: Member = {
    name,
    inviteToken: ownerToken,
    role: 'owner',
    banned: false,
    connections: new Set([creatorWs]),
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(ownerToken, ownerMember);
  session.wsToInviteToken.set(creatorWs, ownerToken);
  inviteTokenIndex.set(ownerToken, session.code);

  // Send owner their identity + token
  const identityMsg: ServerMessage = { type: 'identity', name, role: 'owner' };
  creatorWs.send(JSON.stringify(identityMsg));
  const enabledMsg: ServerMessage = { type: 'managedEnabled', ownerToken };
  creatorWs.send(JSON.stringify(enabledMsg));

  broadcastMemberList(session);
  broadcastManagedClientCount(session);
  return ownerToken;
}

/** Look up an invite token to its session + member (for WS upgrade). */
export function lookupInviteToken(token: string): { session: Session; member: Member } | null {
  const code = inviteTokenIndex.get(token);
  if (!code) return null;
  const session = sessions.get(code);
  if (!session || !session.members) return null;
  const member = session.members.get(token);
  if (!member) return null;
  return { session, member };
}

/** Add a WS connection to a managed session member. */
export function addMemberConnection(session: Session, ws: WebSocket, member: Member): number | false {
  if (session.clients.size >= MAX_CLIENTS_PER_SESSION) return false;

  const clientId = session.nextClientId++;
  session.clients.add(ws);
  session.clientIds.set(ws, clientId);
  session.clientTypes.set(ws, 'unknown');
  session.wsToInviteToken!.set(ws, member.inviteToken);
  member.connections.add(ws);
  member.lastSeen = Date.now();
  session.emptySince = null;

  // Send snapshot
  const activeWorlds: WorldStates = {};
  for (const [key, state] of Object.entries(session.worldStates)) {
    if (state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined) {
      activeWorlds[Number(key)] = state;
    }
  }
  ws.send(JSON.stringify({ type: 'snapshot', worlds: activeWorlds } satisfies ServerMessage));

  // Send identity
  const identityMsg: ServerMessage = { type: 'identity', name: member.name, role: member.role };
  ws.send(JSON.stringify(identityMsg));

  broadcastManagedClientCount(session);
  broadcastMemberList(session);
  broadcast(session, { type: 'memberJoined', name: member.name });

  return clientId;
}

/** Get the member role for a WS connection in a managed session, or null if not a member. */
export function getMemberRole(session: Session, ws: WebSocket): MemberRole | null {
  if (!session.managed || !session.wsToInviteToken || !session.members) return null;
  const token = session.wsToInviteToken.get(ws);
  if (!token) return null;
  const member = session.members.get(token);
  return member?.role ?? null;
}

/** Check if a WS has write permission (owner, moderator, or scout role). */
export function canWrite(session: Session, ws: WebSocket): boolean {
  if (!session.managed) return true; // anonymous sessions allow all writes
  const role = getMemberRole(session, ws);
  if (role === null) return false; // anonymous viewer in managed session
  return role !== 'viewer';
}

/** Check if a WS has admin permission (owner or moderator). */
export function isAdmin(session: Session, ws: WebSocket): boolean {
  const role = getMemberRole(session, ws);
  return role === 'owner' || role === 'moderator';
}

/** Check if a WS is the owner. */
export function isOwner(session: Session, ws: WebSocket): boolean {
  return getMemberRole(session, ws) === 'owner';
}

export function createInvite(session: Session, ws: WebSocket, name: string, role?: 'scout' | 'viewer'): ServerMessage {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };
  if (!isAdmin(session, ws)) return { type: 'error', message: 'Permission denied.' };
  if (session.members.size >= MAX_MEMBERS_PER_SESSION) return { type: 'error', message: 'Maximum members reached.' };

  // Enforce name uniqueness
  for (const m of session.members.values()) {
    if (m.name === name) return { type: 'error', message: 'Name already taken.' };
  }

  const inviteToken = generateInviteToken();
  const member: Member = {
    name,
    inviteToken,
    role: role ?? 'scout',
    banned: false,
    connections: new Set(),
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(inviteToken, member);
  inviteTokenIndex.set(inviteToken, session.code);

  const link = `${APP_URL}/?invite=${inviteToken}`;
  broadcastMemberList(session);
  return { type: 'inviteCreated', inviteToken, name, link };
}

export function banMember(session: Session, ws: WebSocket, inviteToken: string): ServerMessage | null {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };
  if (!isAdmin(session, ws)) return { type: 'error', message: 'Permission denied.' };

  const member = session.members.get(inviteToken);
  if (!member) return { type: 'error', message: 'Member not found.' };

  // Cannot ban the owner
  if (member.role === 'owner') return { type: 'error', message: 'Cannot ban the owner.' };

  // Moderators cannot ban other moderators
  const callerRole = getMemberRole(session, ws);
  if (callerRole === 'moderator' && member.role === 'moderator') {
    return { type: 'error', message: 'Moderators cannot ban other moderators.' };
  }

  member.banned = true;

  // Disconnect all their connections
  for (const memberWs of member.connections) {
    const bannedMsg: ServerMessage = { type: 'banned', reason: 'You have been banned from this session.' };
    if (memberWs.readyState === 1) {
      memberWs.send(JSON.stringify(bannedMsg));
      memberWs.close(1008, 'Banned');
    }
    session.wsToInviteToken!.delete(memberWs);
    removeClient(session, memberWs);
  }
  member.connections.clear();

  // Revoke the token globally
  inviteTokenIndex.delete(inviteToken);

  broadcastMemberList(session);
  broadcastManagedClientCount(session);
  return null; // success, no error
}

export function renameMember(session: Session, ws: WebSocket, inviteToken: string, name: string): ServerMessage | null {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };
  if (!isAdmin(session, ws)) return { type: 'error', message: 'Permission denied.' };

  const member = session.members.get(inviteToken);
  if (!member) return { type: 'error', message: 'Member not found.' };

  // Moderators cannot rename owner or other moderators
  const callerRole = getMemberRole(session, ws);
  if (callerRole === 'moderator' && (member.role === 'owner' || member.role === 'moderator')) {
    return { type: 'error', message: 'Permission denied.' };
  }

  // Enforce uniqueness
  for (const m of session.members.values()) {
    if (m !== member && m.name === name) return { type: 'error', message: 'Name already taken.' };
  }

  member.name = name;

  // Notify the renamed member of their new identity
  for (const memberWs of member.connections) {
    if (memberWs.readyState === 1) {
      memberWs.send(JSON.stringify({ type: 'identity', name, role: member.role } satisfies ServerMessage));
    }
  }

  broadcastMemberList(session);
  return null;
}

export function setMemberRole(session: Session, ws: WebSocket, inviteToken: string, role: 'moderator' | 'scout' | 'viewer'): ServerMessage | null {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };

  const callerRole = getMemberRole(session, ws);
  const member = session.members.get(inviteToken);
  if (!member) return { type: 'error', message: 'Member not found.' };

  // Cannot change owner's role (use transferOwnership instead)
  if (member.role === 'owner') return { type: 'error', message: 'Cannot change the owner role. Use transfer ownership.' };

  if (callerRole === 'owner') {
    // Owner can set any role
  } else if (callerRole === 'moderator') {
    // Moderators cannot modify other moderators
    if (member.role === 'moderator') return { type: 'error', message: 'Moderators cannot modify other moderators.' };
    // Moderators can promote to moderator or demote to scout/viewer
  } else {
    return { type: 'error', message: 'Permission denied.' };
  }

  member.role = role;

  // Notify the member of their new role
  for (const memberWs of member.connections) {
    if (memberWs.readyState === 1) {
      memberWs.send(JSON.stringify({ type: 'identity', name: member.name, role } satisfies ServerMessage));
    }
  }

  broadcastMemberList(session);
  return null;
}

export function transferOwnership(session: Session, ws: WebSocket, inviteToken: string): ServerMessage | null {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };
  if (!isOwner(session, ws)) return { type: 'error', message: 'Only the owner can transfer ownership.' };

  const newOwner = session.members.get(inviteToken);
  if (!newOwner) return { type: 'error', message: 'Member not found.' };
  if (newOwner.role === 'owner') return { type: 'error', message: 'Already the owner.' };

  // Find current owner and demote to moderator
  const callerToken = session.wsToInviteToken!.get(ws);
  if (callerToken) {
    const currentOwner = session.members.get(callerToken);
    if (currentOwner) {
      currentOwner.role = 'moderator';
      for (const ownerWs of currentOwner.connections) {
        if (ownerWs.readyState === 1) {
          ownerWs.send(JSON.stringify({ type: 'identity', name: currentOwner.name, role: 'moderator' } satisfies ServerMessage));
        }
      }
    }
  }

  // Promote new owner
  newOwner.role = 'owner';
  session.ownerToken = inviteToken;
  for (const newOwnerWs of newOwner.connections) {
    if (newOwnerWs.readyState === 1) {
      newOwnerWs.send(JSON.stringify({ type: 'identity', name: newOwner.name, role: 'owner' } satisfies ServerMessage));
    }
  }

  broadcastMemberList(session);
  return null;
}

// ── Session lifecycle ───────────────────────────────────────────────────────

function destroySession(session: Session, closeReason: string) {
  clearInterval(session.transitionTimer);

  // Clean up global pair token index for this session's tokens
  for (const token of session.pairTokens.keys()) {
    pairTokenIndex.delete(token);
  }

  // Clean up global invite token index for this session's tokens
  if (session.members) {
    for (const token of session.members.keys()) {
      inviteTokenIndex.delete(token);
    }
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
