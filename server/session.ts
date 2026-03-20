import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { WorldStates, WorldState } from '../shared/types.ts';
import type { ServerMessage, MemberRole, MemberInfo } from '../shared/protocol.ts';
import { applyTransitions } from '../shared/mutations.ts';
import { log, warn } from './log.ts';

const APP_URL = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');

const MAX_SESSIONS = 1000;
export const MAX_CLIENTS_PER_SESSION = 1000;
const MAX_MEMBERS_PER_SESSION = 500;
const SESSION_INACTIVITY_MS = 24 * 60 * 60 * 1000; // 24 hours
const EMPTY_SESSION_TTL_MS = 60 * 60 * 1000;       // 60 minutes
const TRANSITION_INTERVAL_MS = 10_000;             // 10 seconds
const FORK_INVITE_TTL_MS = 10 * 60 * 1000;        // 10 minutes
const FORK_COOLDOWN_MS = 60 * 60 * 1000;          // 1 hour

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

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
  // Member tracking (all sessions — lightweight in anonymous, full in managed)
  members: Map<string, Member>;        // inviteToken -> Member
  wsToInviteToken: Map<WebSocket, string>;
  // Managed session fields (undefined when anonymous)
  managed?: boolean;
  ownerToken?: string;
  allowViewers?: boolean;              // when true, ?code= connections are admitted as read-only viewers
  // Fork-to-managed fields (anonymous sessions only)
  pendingFork?: {
    managedCode: string;
    initiatorName: string;
    expiresAt: number;
    wsTokens: Map<WebSocket, string>;  // per-connected-client self-register tokens
  };
  lastForkAt?: number;
  // Set on managed sessions created by fork — allows self-registration during the fork invite window
  selfRegisterUntil?: number;
  selfRegisterTokens?: Map<string, boolean>;  // token → consumed; only valid tokens may self-register
}

const sessions = new Map<string, Session>();

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
    if (attempts > 20) {
      throw new Error('Failed to generate unique invite token after 20 attempts');
    }
  } while (inviteTokenIndex.has(token));
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

export function broadcastClientCount(session: Session) {
  let scouts = 0, dashboards = 0;

  for (const ws of session.clients) {
    const t = session.clientTypes.get(ws) ?? 'unknown';
    if (t === 'scout') scouts++;
    else if (t === 'dashboard') dashboards++;
  }

  broadcast(session, { type: 'clientCount', count: session.clients.size, scouts, dashboards });
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
    members: new Map(),
    wsToInviteToken: new Map(),
    transitionTimer: setInterval(() => {
      const s = sessions.get(code);
      if (!s) return;

      const now2 = Date.now();

      // Sweep expired fork invite
      if (s.pendingFork && now2 > s.pendingFork.expiresAt) {
        s.pendingFork = undefined;
        broadcast(s, { type: 'forkInviteExpired' });
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

export function getSessionEntries(): IterableIterator<[string, Session]> {
  return sessions.entries();
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

  // Re-send active fork invite only to clients who were present at fork time (have a self-register token)
  if (session.pendingFork) {
    const { managedCode, initiatorName, expiresAt, wsTokens } = session.pendingFork;
    const selfRegisterToken = wsTokens.get(ws);
    if (selfRegisterToken) {
      const inviteLink = `${APP_URL}/?join=${managedCode}`;
      const personalToken = session.wsToInviteToken.get(ws);
      const forkInviteMsg: ServerMessage = { type: 'forkInvite', managedCode, inviteLink, initiatorName, expiresAt, selfRegisterToken, personalToken };
      ws.send(JSON.stringify(forkInviteMsg));
    }
  }

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

  // Remove from member connections
  const token = session.wsToInviteToken.get(ws);
  if (token) {
    session.wsToInviteToken.delete(ws);
    const member = session.members.get(token);
    if (member) {
      member.connections.delete(ws);
      member.lastSeen = Date.now();
      if (session.managed && member.connections.size === 0) {
        broadcast(session, { type: 'memberLeft', name: member.name });
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
  if (session.managed && originWs) {
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

  // Member-based attribution: send dashboard connections of same member a copy with source = token
  if (originWs) {
    const token = session.wsToInviteToken.get(originWs);
    if (token) {
      const member = session.members.get(token);
      if (member) {
        // Send attributed update to same-member dashboard connections, normal to everyone else
        const attributed = JSON.stringify({ type: 'worldUpdate', worldId, state, source: token });
        const normal = JSON.stringify({ type: 'worldUpdate', worldId, state });
        for (const ws of session.clients) {
          if (ws.readyState !== 1) continue;
          if (ws !== originWs && member.connections.has(ws) && session.clientTypes.get(ws) === 'dashboard') {
            ws.send(attributed);
          } else {
            ws.send(normal);
          }
        }
        return;
      }
    }

  }

  broadcast(session, { type: 'worldUpdate', worldId, state });
}

export function handleReportWorld(session: Session, ws: WebSocket, worldId: number | null): void {
  // Member-based routing: send peerWorld to dashboard connections of the same member
  const token = session.wsToInviteToken.get(ws);
  if (!token) return;
  const member = session.members.get(token);
  if (!member) return;

  member.currentWorld = worldId;

  const peerWorldMsg = JSON.stringify({ type: 'peerWorld', worldId } satisfies ServerMessage);
  for (const conn of member.connections) {
    if (conn !== ws && conn.readyState === 1) {
      const connType = session.clientTypes.get(conn);
      if (connType === 'dashboard') {
        conn.send(peerWorldMsg);
      }
    }
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
      link: `${APP_URL}/#invite=${member.inviteToken}`,
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

/**
 * Internal: initialise managed-mode infrastructure on a session without sending
 * any WebSocket messages.  The caller is responsible for notifying the owner WS.
 * Returns the owner token, or an error if the session is already managed.
 */
function setupManagedOwner(session: Session, name: string, existingToken?: string): string | { error: string } {
  if (session.managed) return { error: 'Session is already managed.' };

  const ownerToken = existingToken ?? generateInviteToken();
  session.managed = true;
  session.ownerToken = ownerToken;

  const ownerMember: Member = {
    name,
    inviteToken: ownerToken,
    role: 'owner',
    banned: false,
    connections: new Set(),   // no WS yet — owner joins via ?invite= on the new session
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(ownerToken, ownerMember);
  inviteTokenIndex.set(ownerToken, session.code);

  return ownerToken;
}

/**
 * Fork an anonymous session into a new managed session.
 * Creates the child session, copies world state, sets up the initiator as owner,
 * and broadcasts a forkInvite to all clients of the original session.
 */
export function forkToManaged(session: Session, _initiatorWs: WebSocket, name: string): { managedCode: string; ownerToken: string } | { error: string } {
  if (session.managed) return { error: 'Managed sessions cannot be forked.' };

  const now = Date.now();

  if (session.pendingFork && now < session.pendingFork.expiresAt) {
    return { error: 'A managed fork invite is already active for this session.' };
  }

  if (session.lastForkAt !== undefined && now - session.lastForkAt < FORK_COOLDOWN_MS) {
    const remainingMin = Math.ceil((FORK_COOLDOWN_MS - (now - session.lastForkAt)) / 60_000);
    return { error: `Please wait ${remainingMin} minute${remainingMin === 1 ? '' : 's'} before creating another managed fork.` };
  }

  // Create the child managed session
  const childResult = createSession();
  if ('error' in childResult) return childResult;
  const childSession = sessions.get(childResult.code)!;

  // Copy world state snapshot
  childSession.worldStates = { ...session.worldStates };

  // If the initiator already has a personal token (e.g. linked Alt1 scout),
  // reuse it as the owner token so the scout can follow via redirect.
  const initiatorToken = session.wsToInviteToken.get(_initiatorWs);
  const ownerResult = setupManagedOwner(childSession, name, initiatorToken);
  if (typeof ownerResult === 'object' && 'error' in ownerResult) return ownerResult;
  const ownerToken = ownerResult;

  // Migrate the token from the anonymous session to the managed session
  if (initiatorToken) {
    // Update global index to point to the new managed session
    inviteTokenIndex.set(initiatorToken, childSession.code);

    // Collect the initiator's other connections (e.g. scout) to redirect later
    const initiatorMember = session.members.get(initiatorToken);
    const connectionsToRedirect: WebSocket[] = [];
    if (initiatorMember) {
      for (const conn of initiatorMember.connections) {
        if (conn !== _initiatorWs && conn.readyState === 1) {
          connectionsToRedirect.push(conn);
        }
      }
      // Clean up from the anonymous session
      session.members.delete(initiatorToken);
      for (const conn of initiatorMember.connections) {
        session.wsToInviteToken.delete(conn);
      }
    }

    // Send redirect to the scout connections after the fork is set up
    // (deferred until after forkCreated is sent — see below)
    setTimeout(() => {
      for (const conn of connectionsToRedirect) {
        conn.send(JSON.stringify({ type: 'redirect', code: childSession.code } satisfies ServerMessage));
        // Remove from anonymous session so onclose doesn't double-count
        removeClient(session, conn);
      }
    }, 0);
  }

  const expiresAt = now + FORK_INVITE_TTL_MS;
  const wsTokens = new Map<WebSocket, string>();
  const selfRegisterTokens = new Map<string, boolean>();

  // Generate a unique self-register token for each currently connected client
  for (const ws of session.clients) {
    const srToken = crypto.randomBytes(16).toString('hex');
    wsTokens.set(ws, srToken);
    selfRegisterTokens.set(srToken, false);
  }

  session.pendingFork = { managedCode: childResult.code, initiatorName: name, expiresAt, wsTokens };
  session.lastForkAt = now;
  childSession.selfRegisterUntil = expiresAt;
  childSession.selfRegisterTokens = selfRegisterTokens;

  // Send each client their personalized fork invite (with their unique self-register token + personal token if they have one)
  const inviteLink = `${APP_URL}/?join=${childResult.code}`;
  for (const ws of session.clients) {
    if (ws.readyState !== 1) continue;
    const selfRegisterToken = wsTokens.get(ws);
    const personalToken = session.wsToInviteToken.get(ws);
    const msg: ServerMessage = { type: 'forkInvite', managedCode: childResult.code, inviteLink, initiatorName: name, expiresAt, selfRegisterToken, personalToken };
    ws.send(JSON.stringify(msg));
  }

  log(`[fork] ${session.code} forked to managed session ${childResult.code} by "${name}"`);
  return { managedCode: childResult.code, ownerToken };
}

/**
 * Self-registration for fork invitees: creates a scout-role member entry without
 * requiring an admin to pre-create the invite.  Only allowed during the fork window.
 */
export function selfRegisterMember(session: Session, name: string, selfRegisterToken: string, personalToken?: string): { inviteToken: string } | { error: string } {
  if (!session.managed) return { error: 'Session is not managed.' };
  if (!session.selfRegisterUntil || Date.now() > session.selfRegisterUntil) {
    return { error: 'Self-registration window has closed.' };
  }
  if (!session.selfRegisterTokens) return { error: 'Self-registration is not available.' };
  const consumed = session.selfRegisterTokens.get(selfRegisterToken);
  if (consumed === undefined) return { error: 'Invalid self-registration token.' };
  if (consumed) return { error: 'This self-registration token has already been used.' };
  // Reject duplicate names
  for (const m of session.members.values()) {
    if (!m.banned && m.name.toLowerCase() === name.toLowerCase()) {
      return { error: 'That name is already taken in this session.' };
    }
  }
  if (session.members.size >= MAX_MEMBERS_PER_SESSION) {
    return { error: 'Session is full.' };
  }

  // If the client has a personal token from the anonymous session, migrate it
  let inviteToken: string;
  if (personalToken && /^[A-HJ-NP-Z2-9]{12}$/.test(personalToken)) {
    // Validate the personal token existed in the anonymous session
    const oldCode = inviteTokenIndex.get(personalToken);
    if (oldCode && oldCode !== session.code) {
      // Valid personal token from another session — migrate it
      inviteToken = personalToken;
      inviteTokenIndex.delete(personalToken);
      // Remove from old session's member map (cleanup)
      const oldSession = sessions.get(oldCode);
      if (oldSession) {
        oldSession.members.delete(personalToken);
      }
    } else {
      inviteToken = generateInviteToken();
    }
  } else {
    inviteToken = generateInviteToken();
  }

  const member: Member = {
    name,
    inviteToken,
    role: 'scout',
    banned: false,
    connections: new Set(),
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(inviteToken, member);
  inviteTokenIndex.set(inviteToken, session.code);
  session.selfRegisterTokens.set(selfRegisterToken, true);  // consume
  return { inviteToken };
}

/** Look up an invite token to its session + member (for WS upgrade). */
export function lookupInviteToken(token: string): { session: Session; member: Member } | null {
  const code = inviteTokenIndex.get(token);
  if (!code) return null;
  const session = sessions.get(code);
  if (!session) return null;
  const member = session.members.get(token);
  if (!member) return null;
  return { session, member };
}

/** Authenticate using a session code (anonymous session join). */
export function authenticateByCode(code: string): Session | { error: string } {
  const session = getSession(code);
  if (!session) {
    return { error: 'Session not found.' };
  }
  return session;
}

/** Authenticate using an invite token (managed member or personal token reconnection). */
export function authenticateByInviteToken(token: string): { session: Session; member: Member } | { error: string } {
  const resolved = lookupInviteToken(token);
  if (!resolved) {
    return { error: 'Invalid invite token.' };
  }
  if (resolved.member.banned) {
    return { error: 'You are banned from this session.' };
  }
  return resolved;
}

/** Authenticate using a personal token (dashboard-scout pairing or identity persistence). */
export function authenticateByPersonalToken(token: string): { session: Session; member: Member } | { error: string } {
  const resolved = lookupInviteToken(token);
  if (!resolved) {
    return { error: 'Invalid personal token.' };
  }
  if (resolved.member.banned) {
    return { error: 'You are banned from this session.' };
  }
  return resolved;
}

/** Add a WS connection to a session member (managed or anonymous with personal token). */
export function addMemberConnection(session: Session, ws: WebSocket, member: Member): number | false {
  if (session.clients.size >= MAX_CLIENTS_PER_SESSION) return false;

  const clientId = session.nextClientId++;
  session.clients.add(ws);
  session.clientIds.set(ws, clientId);
  session.clientTypes.set(ws, 'unknown');
  session.wsToInviteToken.set(ws, member.inviteToken);
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

  // Send identity (both managed and anonymous members)
  const identityMsg: ServerMessage = { type: 'identity', name: member.name, role: member.role, sessionCode: session.code };
  ws.send(JSON.stringify(identityMsg));

  if (session.managed) {
    // Send allowViewers setting
    if (session.allowViewers) {
      ws.send(JSON.stringify({ type: 'allowViewers', allow: true } satisfies ServerMessage));
    }

    // Owner gets their token so the client can persist it for reconnection
    if (member.role === 'owner' && session.ownerToken) {
      const enabledMsg: ServerMessage = { type: 'managedEnabled', ownerToken: session.ownerToken };
      ws.send(JSON.stringify(enabledMsg));
    }

    broadcastManagedClientCount(session);
    broadcastMemberList(session);
    broadcast(session, { type: 'memberJoined', name: member.name });
  } else {
    // Anonymous session: just update the client count
    broadcastClientCount(session);
  }

  return clientId;
}

/** Get the member role for a WS connection in a managed session, or null if not a member. */
export function getMemberRole(session: Session, ws: WebSocket): MemberRole | null {
  if (!session.managed) return null;
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

/**
 * Generate a personal token for a client in any session (anonymous or managed).
 * In anonymous sessions, this creates a lightweight member entry for dashboard↔scout linking.
 * In managed sessions, returns the member's existing invite token.
 */
export function requestPersonalToken(session: Session, ws: WebSocket): ServerMessage {
  // If this WS already has a token (member connection), return it
  const existingToken = session.wsToInviteToken.get(ws);
  if (existingToken) {
    return { type: 'personalToken', token: existingToken };
  }

  // Managed sessions: must join via invite — can't generate a personal token as anonymous
  if (session.managed) {
    return { type: 'error', message: 'Join with an invite link to get your personal token.' };
  }

  // Anonymous session: create a lightweight member entry
  const token = generateInviteToken();
  const member: Member = {
    name: 'Anonymous',
    inviteToken: token,
    role: 'scout',
    banned: false,
    connections: new Set([ws]),
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(token, member);
  session.wsToInviteToken.set(ws, token);
  inviteTokenIndex.set(token, session.code);

  return { type: 'personalToken', token };
}

export function setAllowViewers(session: Session, ws: WebSocket, allow: boolean): ServerMessage | null {
  if (!session.managed) return { type: 'error', message: 'Session is not managed.' };
  if (!isAdmin(session, ws)) return { type: 'error', message: 'Permission denied.' };
  session.allowViewers = allow;
  broadcast(session, { type: 'allowViewers', allow });
  return null;
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

  const link = `${APP_URL}/#invite=${inviteToken}`;
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
      memberWs.send(JSON.stringify({ type: 'identity', name, role: member.role, sessionCode: session.code } satisfies ServerMessage));
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
      memberWs.send(JSON.stringify({ type: 'identity', name: member.name, role, sessionCode: session.code } satisfies ServerMessage));
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
          ownerWs.send(JSON.stringify({ type: 'identity', name: currentOwner.name, role: 'moderator', sessionCode: session.code } satisfies ServerMessage));
        }
      }
    }
  }

  // Promote new owner
  newOwner.role = 'owner';
  session.ownerToken = inviteToken;
  for (const newOwnerWs of newOwner.connections) {
    if (newOwnerWs.readyState === 1) {
      newOwnerWs.send(JSON.stringify({ type: 'identity', name: newOwner.name, role: 'owner', sessionCode: session.code } satisfies ServerMessage));
    }
  }

  broadcastMemberList(session);
  return null;
}

// ── Session lifecycle ───────────────────────────────────────────────────────

function destroySession(session: Session, closeReason: string) {
  clearInterval(session.transitionTimer);

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
