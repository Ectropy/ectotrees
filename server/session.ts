import crypto from 'node:crypto';
import type { WebSocket } from 'ws';
import type { WorldStates, WorldState } from '../shared/types.ts';
import type { ServerMessage, SessionSummary, MemberRole, MemberInfo } from '../shared/protocol.ts';
import { applyTransitions } from '../shared/mutations.ts';
import { containsProfanity } from './profanity.ts';
import { log, warn } from './log.ts';

export const APP_URL = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');

const MAX_SESSIONS = 1000;
export const MAX_CLIENTS_PER_SESSION = 1000;
const MAX_MEMBERS_PER_SESSION = 500;
const SESSION_INACTIVITY_MS = 10 * 24 * 60 * 60 * 1000; // 10 days
const EMPTY_SESSION_TTL_MS = 24 * 60 * 60 * 1000;       // 24 hours
const TRANSITION_INTERVAL_MS = 10_000;             // 10 seconds
const FORK_INVITE_TTL_MS = 15 * 60 * 1000;        // 15 minutes
const FORK_COOLDOWN_MS = FORK_INVITE_TTL_MS;       // same as invite TTL — new fork allowed once invite window closes

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

export interface Member {
  name: string;
  identityToken: string;
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
  members: Map<string, Member>;          // identityToken -> Member
  wsToIdentityToken: Map<WebSocket, string>;
  // Managed session fields (undefined when anonymous)
  managed?: boolean;
  ownerToken?: string;
  allowOpenJoin?: boolean;             // when true, anyone can self-issue a scout invite via POST /api/session/:code/open-join
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
  // Session browser fields
  name?: string;
  description?: string;
  listed?: boolean;
}

const sessions = new Map<string, Session>();

// Global index: identity token → session code for O(1) lookup during WS upgrade
const identityTokenIndex = new Map<string, string>();

function generateToken(length: number): string {
  let token = '';
  for (let i = 0; i < length; i++) {
    token += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return token;
}

function generateUniqueIdentityToken(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = generateToken(12);
    if (!identityTokenIndex.has(token)) return token;
  }
  throw new Error('Failed to generate unique identity token after 20 attempts');
}

function broadcast(session: Session, msg: ServerMessage) {
  const data = JSON.stringify(msg);
  for (const ws of session.clients) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(data);
    }
  }
}

export function createSession(): { code: string } | { error: string } {
  if (sessions.size >= MAX_SESSIONS) {
    return { error: 'Maximum number of active sessions reached. Try again later.' };
  }

  let code: string;
  let attempts = 0;
  do {
    code = generateToken(6);
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
    wsToIdentityToken: new Map(),
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

  if (session.name) {
    ws.send(JSON.stringify({ type: 'sessionSettingsUpdated', name: session.name, description: session.description ?? null, listed: !!session.listed } satisfies ServerMessage));
  }

  // Re-send active fork invite to all connecting clients; selfRegisterToken only included for those present at fork time
  if (session.pendingFork) {
    const { managedCode, initiatorName, expiresAt, wsTokens } = session.pendingFork;
    const selfRegisterToken = wsTokens.get(ws);
    const inviteLink = `${APP_URL}/#join=${managedCode}`;
    const identityToken = session.wsToIdentityToken.get(ws);
    const forkInviteMsg: ServerMessage = { type: 'forkInvite', managedCode, inviteLink, initiatorName, expiresAt, selfRegisterToken, identityToken };
    ws.send(JSON.stringify(forkInviteMsg));
  }

  broadcastClientCount(session);

  // Send initial member list to the new client (covers anonymous viewers who won't go
  // through addMemberConnection, which is where identified members receive theirs)
  if (session.managed && session.members) {
    const members = buildMemberList(session);
    ws.send(JSON.stringify({ type: 'memberList', members } satisfies ServerMessage));
  }

  return clientId;
}

export function setClientType(session: Session, ws: WebSocket, type: 'scout' | 'dashboard'): void {
  session.clientTypes.set(ws, type);
  if (session.managed) {
    const token = session.wsToIdentityToken.get(ws);
    const member = token ? session.members.get(token) : undefined;
    if (member) {
      broadcast(session, { type: 'memberJoined', name: member.name, clientType: type });
    }
  }
  broadcastClientCount(session);

  // Notify peer connections about scout presence
  const token = session.wsToIdentityToken.get(ws);
  if (token) {
    const member = session.members.get(token);
    if (member) {
      if (type === 'scout') {
        // Scout just identified — notify peer dashboard connections
        const connectMsg = JSON.stringify({ type: 'peerScout', connected: true } satisfies ServerMessage);
        for (const conn of member.connections) {
          if (conn !== ws && conn.readyState === 1 && session.clientTypes.get(conn) === 'dashboard') {
            conn.send(connectMsg);
            if (member.currentWorld !== null) {
              conn.send(JSON.stringify({ type: 'peerWorld', worldId: member.currentWorld } satisfies ServerMessage));
            }
          }
        }
      } else if (type === 'dashboard') {
        // Dashboard just identified — tell it if a scout is already connected for this member
        const hasScout = [...member.connections].some(c => c !== ws && session.clientTypes.get(c) === 'scout');
        if (hasScout) {
          ws.send(JSON.stringify({ type: 'peerScout', connected: true } satisfies ServerMessage));
          if (member.currentWorld !== null) {
            ws.send(JSON.stringify({ type: 'peerWorld', worldId: member.currentWorld } satisfies ServerMessage));
          }
        }
      }
    }
  }
}

export function removeClient(session: Session, ws: WebSocket) {
  if (!session.clients.has(ws)) {
    return false;
  }
  // Save type before removing — needed for memberLeft clientType
  const clientType = session.clientTypes.get(ws) ?? 'unknown';
  session.clients.delete(ws);
  session.clientIds.delete(ws);
  session.clientTypes.delete(ws);

  // Remove from member connections
  const token = session.wsToIdentityToken.get(ws);
  if (token) {
    session.wsToIdentityToken.delete(ws);
    const member = session.members.get(token);
    if (member) {
      member.connections.delete(ws);
      member.lastSeen = Date.now();
      if (session.managed) {
        broadcast(session, { type: 'memberLeft', name: member.name, clientType });
      }
      // If the last scout connection for this member disconnected, notify peer dashboards
      if (clientType === 'scout') {
        const hasRemainingScout = [...member.connections].some(c => session.clientTypes.get(c) === 'scout');
        if (!hasRemainingScout) {
          member.currentWorld = null;
          const msg = JSON.stringify({ type: 'peerScout', connected: false } satisfies ServerMessage);
          for (const conn of member.connections) {
            if (conn.readyState === 1 && session.clientTypes.get(conn) === 'dashboard') {
              conn.send(msg);
            }
          }
        }
      }
    }
  }

  if (session.clients.size === 0) {
    session.emptySince = Date.now();
  }
  broadcastClientCount(session);
  if (session.managed) {
    broadcastMemberList(session);
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

  // Attribution: send ownUpdate flag to originator's dashboard connections;
  // managed sessions also broadcast source { name, role } to everyone else.
  if (originWs) {
    const token = session.wsToIdentityToken.get(originWs);
    if (token) {
      const member = session.members.get(token);
      if (member) {
        const source = session.managed ? { name: member.name, role: member.role } : undefined;
        const ownMsg = JSON.stringify({ type: 'worldUpdate', worldId, state, ownUpdate: true });
        const otherMsg = JSON.stringify({ type: 'worldUpdate', worldId, state, ...(source && { source }) });
        for (const ws of session.clients) {
          if (ws.readyState !== 1) continue;
          if (ws !== originWs && member.connections.has(ws) && session.clientTypes.get(ws) === 'dashboard') {
            ws.send(ownMsg);
          } else {
            ws.send(otherMsg);
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
  const token = session.wsToIdentityToken.get(ws);
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

  // Build admin version with identity tokens and invite links
  const adminMembers: MemberInfo[] = [];
  for (const member of session.members.values()) {
    if (member.banned) continue;
    adminMembers.push({
      name: member.name,
      role: member.role,
      online: member.connections.size > 0,
      currentWorld: member.currentWorld,
      identityToken: member.identityToken,
      link: `${APP_URL}/#identity=${member.identityToken}`,
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

function broadcastClientCount(session: Session) {
  // count        — unique people online (deduplicated by identity token)
  // scouts       — unique people with ≥1 scout (Alt1) connection
  // dashboards   — unique people with ≥1 dashboard connection
  // identityViewers  — online members with role 'viewer' (managed only)
  // anonymousViewers — connections with no identity token (no dedup possible)
  let count = 0, scouts = 0, dashboards = 0, identityViewers = 0, anonymousViewers = 0;
  for (const member of session.members.values()) {
    if (member.banned || member.connections.size === 0) continue;
    count++;
    if (member.role === 'viewer') identityViewers++;
    let hasScout = false, hasDashboard = false;
    for (const ws of member.connections) {
      const t = session.clientTypes.get(ws) ?? 'unknown';
      if (t === 'scout') hasScout = true;
      if (t === 'dashboard') hasDashboard = true;
    }
    if (hasScout) scouts++;
    if (hasDashboard) dashboards++;
  }
  // Connections without an identity token — each counts as its own person
  for (const ws of session.clients) {
    if (!session.wsToIdentityToken?.has(ws)) {
      count++;
      anonymousViewers++;
      const t = session.clientTypes.get(ws) ?? 'unknown';
      if (t === 'scout') scouts++;
      else if (t === 'dashboard') dashboards++;
    }
  }
  broadcast(session, { type: 'clientCount', count, scouts, dashboards, identityViewers, anonymousViewers });
}

/**
 * Internal: initialise managed-mode infrastructure on a session without sending
 * any WebSocket messages.  The caller is responsible for notifying the owner WS.
 * Returns the owner token, or an error if the session is already managed.
 */
function setupManagedOwner(session: Session, name: string, existingToken?: string): string | { error: string } {
  if (session.managed) return { error: 'Session is already managed.' };

  const ownerToken = existingToken ?? generateUniqueIdentityToken();
  session.managed = true;
  session.ownerToken = ownerToken;

  const ownerMember: Member = {
    name,
    identityToken: ownerToken,
    role: 'owner',
    banned: false,
    connections: new Set(),   // no WS yet — owner joins via #identity= on the new session
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(ownerToken, ownerMember);
  identityTokenIndex.set(ownerToken, session.code);

  return ownerToken;
}

/**
 * Fork an anonymous session into a new managed session.
 * Creates the child session, copies world state, sets up the initiator as owner,
 * and broadcasts a forkInvite to all clients of the original session.
 */
export function forkToManaged(session: Session, _initiatorWs: WebSocket, name: string): { managedCode: string; identityToken: string } | { error: string } {
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

  // Auto-name the session from the owner's display name
  childSession.name = name.endsWith('s') ? `${name}' Session` : `${name}'s Session`;

  // Copy world state snapshot
  childSession.worldStates = { ...session.worldStates };

  // If the initiator already has an identity token (e.g. linked Alt1 scout),
  // reuse it as the owner token so the scout can follow via redirect.
  const initiatorToken = session.wsToIdentityToken.get(_initiatorWs);
  const ownerResult = setupManagedOwner(childSession, name, initiatorToken);
  if (typeof ownerResult === 'object' && 'error' in ownerResult) return ownerResult;
  const ownerToken = ownerResult;

  // Migrate the token from the anonymous session to the managed session
  if (initiatorToken) {
    // Update global index to point to the new managed session
    identityTokenIndex.set(initiatorToken, childSession.code);

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
        session.wsToIdentityToken.delete(conn);
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

  // Send each client their personalized fork invite (with their unique self-register token + identity token if they have one)
  const inviteLink = `${APP_URL}/#join=${childResult.code}`;
  for (const ws of session.clients) {
    if (ws.readyState !== 1) continue;
    const selfRegisterToken = wsTokens.get(ws);
    const identityToken = session.wsToIdentityToken.get(ws);
    const msg: ServerMessage = { type: 'forkInvite', managedCode: childResult.code, inviteLink, initiatorName: name, expiresAt, selfRegisterToken, identityToken };
    ws.send(JSON.stringify(msg));
  }

  log(`[fork] ${session.code} forked to managed session ${childResult.code} by "${name}"`);
  return { managedCode: childResult.code, identityToken: ownerToken };
}

/**
 * Self-registration for fork invitees: creates a scout-role member entry without
 * requiring an admin to pre-create the invite.  Only allowed during the fork window.
 */
export function selfRegisterMember(session: Session, name: string, selfRegisterToken: string, existingToken?: string): { identityToken: string } | { error: string } {
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

  // If the client has an identity token from the anonymous session, migrate it
  let identityToken: string;
  if (existingToken && /^[A-HJ-NP-Z2-9]{12}$/.test(existingToken)) {
    // Validate the identity token existed in the anonymous session
    const oldCode = identityTokenIndex.get(existingToken);
    if (oldCode && oldCode !== session.code) {
      // Valid identity token from another session — migrate it
      identityToken = existingToken;
      identityTokenIndex.delete(existingToken);
      // Remove from old session's member map (cleanup)
      const oldSession = sessions.get(oldCode);
      if (oldSession) {
        oldSession.members.delete(existingToken);
      }
    } else {
      identityToken = generateUniqueIdentityToken();
    }
  } else {
    identityToken = generateUniqueIdentityToken();
  }

  const member: Member = {
    name,
    identityToken,
    role: 'scout',
    banned: false,
    connections: new Set(),
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(identityToken, member);
  identityTokenIndex.set(identityToken, session.code);
  session.selfRegisterTokens.set(selfRegisterToken, true);  // consume
  return { identityToken };
}

/** Look up an identity token to its session + member (for WS upgrade). */
function lookupIdentityToken(token: string): { session: Session; member: Member } | null {
  const code = identityTokenIndex.get(token);
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

/** Authenticate using an identity token (managed member join or anonymous scout reconnection). */
export function authenticateByIdentityToken(token: string): { session: Session; member: Member } | { error: string } {
  const resolved = lookupIdentityToken(token);
  if (!resolved) {
    return { error: 'Invalid identity token.' };
  }
  if (resolved.member.banned) {
    return { error: 'You are banned from this session.' };
  }
  return resolved;
}

/** Add a WS connection to a session member (managed or anonymous with identity token). */
export function addMemberConnection(session: Session, ws: WebSocket, member: Member): number | false {
  if (session.clients.size >= MAX_CLIENTS_PER_SESSION) return false;

  const clientId = session.nextClientId++;
  session.clients.add(ws);
  session.clientIds.set(ws, clientId);
  session.clientTypes.set(ws, 'unknown');
  session.wsToIdentityToken.set(ws, member.identityToken);
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

  if (session.name) {
    ws.send(JSON.stringify({ type: 'sessionSettingsUpdated', name: session.name, description: session.description ?? null, listed: !!session.listed } satisfies ServerMessage));
  }

  // Send identity (both managed and anonymous members)
  const identityMsg: ServerMessage = { type: 'identity', name: member.name, role: member.role, sessionCode: session.code };
  ws.send(JSON.stringify(identityMsg));

  if (session.managed) {
    // Send allowOpenJoin setting
    if (session.allowOpenJoin) {
      ws.send(JSON.stringify({ type: 'allowOpenJoin', allow: true } satisfies ServerMessage));
    }

    // Owner gets their token so the client can persist it for reconnection
    if (member.role === 'owner' && session.ownerToken) {
      const enabledMsg: ServerMessage = { type: 'managedEnabled', identityToken: session.ownerToken };
      ws.send(JSON.stringify(enabledMsg));
    }

    broadcastClientCount(session);
    broadcastMemberList(session);
    // memberJoined is broadcast from setClientType once the client declares its type
  } else {
    // Anonymous session: update the client count (deduplicates by identity token)
    broadcastClientCount(session);
  }

  return clientId;
}

/** Get the member role for a WS connection in a managed session, or null if not a member. */
export function getMemberRole(session: Session, ws: WebSocket): MemberRole | null {
  if (!session.managed) return null;
  const token = session.wsToIdentityToken.get(ws);
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
 * Generate an identity token for a client in any session (anonymous or managed).
 * In anonymous sessions, this creates a lightweight member entry for dashboard↔scout linking.
 * In managed sessions, returns the member's existing identity token.
 */
export function requestIdentityToken(session: Session, ws: WebSocket): ServerMessage {
  // If this WS already has a token (member connection), return it
  const existingToken = session.wsToIdentityToken.get(ws);
  if (existingToken) {
    return { type: 'identityToken', token: existingToken };
  }

  // Managed sessions: must join via invite — can't generate an identity token as anonymous
  if (session.managed) {
    return { type: 'error', message: 'Join with an invite link to get your identity token.' };
  }

  // Anonymous session: create a lightweight member entry
  const token = generateUniqueIdentityToken();
  const member: Member = {
    name: 'Anonymous',
    identityToken: token,
    role: 'scout',
    banned: false,
    connections: new Set([ws]),
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(token, member);
  session.wsToIdentityToken.set(ws, token);
  identityTokenIndex.set(token, session.code);

  return { type: 'identityToken', token };
}

export function setAllowOpenJoin(session: Session, ws: WebSocket, allow: boolean): ServerMessage | null {
  if (!session.managed) return { type: 'error', message: 'Session is not managed.' };
  if (!isAdmin(session, ws)) return { type: 'error', message: 'Permission denied.' };
  session.allowOpenJoin = allow;
  broadcast(session, { type: 'allowOpenJoin', allow });
  return null;
}

export function createOpenJoinInvite(session: Session, name: string): { identityToken: string } | { error: string } {
  if (!session.managed || !session.members) return { error: 'Session is not managed.' };
  if (!session.allowOpenJoin) return { error: 'This session does not allow open join.' };
  if (session.members.size >= MAX_MEMBERS_PER_SESSION) return { error: 'Session is full.' };

  // eslint-disable-next-line no-control-regex
  const sanitized = name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 200);
  if (!sanitized) return { error: 'Name is required.' };
  if (containsProfanity(sanitized)) return { error: 'Name contains inappropriate language.' };

  // Enforce name uniqueness (case-insensitive)
  for (const m of session.members.values()) {
    if (!m.banned && m.name.toLowerCase() === sanitized.toLowerCase()) {
      return { error: 'Name already taken.' };
    }
  }

  const identityToken = generateUniqueIdentityToken();
  const member: Member = {
    name: sanitized,
    identityToken,
    role: 'scout',
    banned: false,
    connections: new Set(),
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(identityToken, member);
  identityTokenIndex.set(identityToken, session.code);
  broadcastMemberList(session);
  return { identityToken };
}

export function createInvite(session: Session, ws: WebSocket, name: string, role?: 'scout' | 'viewer'): ServerMessage {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };
  if (!isAdmin(session, ws)) return { type: 'error', message: 'Permission denied.' };
  if (session.members.size >= MAX_MEMBERS_PER_SESSION) return { type: 'error', message: 'Maximum members reached.' };

  // Enforce name uniqueness
  for (const m of session.members.values()) {
    if (m.name === name) return { type: 'error', message: 'Name already taken.' };
  }

  const identityToken = generateUniqueIdentityToken();
  const member: Member = {
    name,
    identityToken,
    role: role ?? 'scout',
    banned: false,
    connections: new Set(),
    currentWorld: null,
    lastSeen: Date.now(),
  };
  session.members.set(identityToken, member);
  identityTokenIndex.set(identityToken, session.code);

  const link = `${APP_URL}/#identity=${identityToken}`;
  broadcastMemberList(session);
  return { type: 'inviteCreated', identityToken, name, link };
}

/** Sends a message to all open WebSocket connections belonging to a member. */
function notifyMember(member: Member, msg: ServerMessage) {
  const json = JSON.stringify(msg);
  for (const ws of member.connections) {
    if (ws.readyState === 1) ws.send(json);
  }
}

/**
 * Shared guard for admin member operations: verifies the session is managed,
 * that the caller is an admin, and that the target member exists.
 * Returns the member on success, or an error ServerMessage on failure.
 */
function ensureManagedAdmin(
  session: Session,
  ws: WebSocket,
  identityToken: string,
): { member: Member } | ServerMessage {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };
  if (!isAdmin(session, ws)) return { type: 'error', message: 'Permission denied.' };
  const member = session.members.get(identityToken);
  if (!member) return { type: 'error', message: 'Member not found.' };
  return { member };
}

export function banMember(session: Session, ws: WebSocket, identityToken: string): ServerMessage | null {
  const guard = ensureManagedAdmin(session, ws, identityToken);
  if ('type' in guard) return guard;
  const { member } = guard;

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
    session.wsToIdentityToken!.delete(memberWs);
    removeClient(session, memberWs);
  }
  member.connections.clear();

  // Revoke the token globally
  identityTokenIndex.delete(identityToken);

  broadcastMemberList(session);
  broadcastClientCount(session);
  return null; // success, no error
}

export function kickMember(session: Session, ws: WebSocket, identityToken: string): ServerMessage | null {
  const guard = ensureManagedAdmin(session, ws, identityToken);
  if ('type' in guard) return guard;
  const { member } = guard;

  if (member.role === 'owner') return { type: 'error', message: 'Cannot kick the owner.' };

  const callerRole = getMemberRole(session, ws);
  if (callerRole === 'moderator' && member.role === 'moderator') {
    return { type: 'error', message: 'Moderators cannot kick other moderators.' };
  }

  // Disconnect all their connections but leave the token valid so they can rejoin.
  // Perform cleanup inline (without calling removeClient) so that member.connections
  // is cleared before any broadcast fires — avoiding an intermediate broadcast that
  // incorrectly shows the member as still online.
  for (const memberWs of member.connections) {
    if (memberWs.readyState === 1) {
      memberWs.send(JSON.stringify({ type: 'kicked' }));
      memberWs.close(1008, 'Kicked');
    }
    session.wsToIdentityToken!.delete(memberWs);
    session.clients.delete(memberWs);
    session.clientIds.delete(memberWs);
    session.clientTypes.delete(memberWs);
  }
  member.connections.clear();
  if (session.clients.size === 0) session.emptySince = Date.now();

  broadcastMemberList(session);
  broadcastClientCount(session);
  return null;
}

export function renameMember(session: Session, ws: WebSocket, identityToken: string, name: string): ServerMessage | null {
  const guard = ensureManagedAdmin(session, ws, identityToken);
  if ('type' in guard) return guard;
  const { member } = guard;

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
  notifyMember(member, { type: 'identity', name, role: member.role, sessionCode: session.code });

  broadcastMemberList(session);
  return null;
}

export function setMemberRole(session: Session, ws: WebSocket, identityToken: string, role: 'moderator' | 'scout' | 'viewer'): ServerMessage | null {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };

  const callerRole = getMemberRole(session, ws);
  const member = session.members.get(identityToken);
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
  notifyMember(member, { type: 'identity', name: member.name, role, sessionCode: session.code });

  broadcastMemberList(session);
  return null;
}

export function transferOwnership(session: Session, ws: WebSocket, identityToken: string): ServerMessage | null {
  if (!session.managed || !session.members) return { type: 'error', message: 'Session is not managed.' };
  if (!isOwner(session, ws)) return { type: 'error', message: 'Only the owner can transfer ownership.' };

  const newOwner = session.members.get(identityToken);
  if (!newOwner) return { type: 'error', message: 'Member not found.' };
  if (newOwner.role === 'owner') return { type: 'error', message: 'Already the owner.' };

  // Find current owner and demote to moderator
  const callerToken = session.wsToIdentityToken!.get(ws);
  if (callerToken) {
    const currentOwner = session.members.get(callerToken);
    if (currentOwner) {
      currentOwner.role = 'moderator';
      notifyMember(currentOwner, { type: 'identity', name: currentOwner.name, role: 'moderator', sessionCode: session.code });
    }
  }

  // Promote new owner
  newOwner.role = 'owner';
  session.ownerToken = identityToken;
  notifyMember(newOwner, { type: 'identity', name: newOwner.name, role: 'owner', sessionCode: session.code });

  broadcastMemberList(session);
  return null;
}

// ── Session browser ────────────────────────────────────────────────────────

export function getListedSessions(): SessionSummary[] {
  const results: SessionSummary[] = [];
  for (const session of sessions.values()) {
    if (!session.managed || !session.listed || !session.name) continue;
    let activeWorldCount = 0;
    for (const state of Object.values(session.worldStates)) {
      if (state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined) {
        activeWorldCount++;
      }
    }
    let memberCount: number;
    if (session.managed) {
      memberCount = 0;
      for (const m of session.members.values()) {
        if (!m.banned) memberCount++;
      }
    } else {
      memberCount = session.clients.size;
    }
    let scouts = 0, dashboards = 0;
    for (const member of session.members.values()) {
      if (member.banned || member.connections.size === 0) continue;
      let hasScout = false, hasDashboard = false;
      for (const ws of member.connections) {
        const t = session.clientTypes.get(ws) ?? 'unknown';
        if (t === 'scout') hasScout = true;
        if (t === 'dashboard') hasDashboard = true;
      }
      if (hasScout) scouts++;
      if (hasDashboard) dashboards++;
    }
    for (const ws of session.clients) {
      if (!session.wsToIdentityToken?.has(ws)) {
        const t = session.clientTypes.get(ws) ?? 'unknown';
        if (t === 'scout') scouts++;
        else if (t === 'dashboard') dashboards++;
      }
    }
    results.push({
      code: session.code,
      name: session.name,
      description: session.description,
      managed: !!session.managed,
      allowOpenJoin: !!session.allowOpenJoin,
      clientCount: session.clients.size,
      scouts,
      dashboards,
      memberCount,
      activeWorldCount,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    });
  }
  results.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return results.slice(0, 50);
}

export function updateSessionSettings(
  session: Session,
  ws: WebSocket,
  settings: { name?: string; description?: string; listed?: boolean },
): ServerMessage | null {
  if (!session.managed) {
    return { type: 'error', message: 'Session visibility settings require a managed session.' };
  }
  if (!isAdmin(session, ws)) {
    return { type: 'error', message: 'Permission denied.' };
  }

  if (settings.name !== undefined) session.name = settings.name || undefined;
  if (settings.description !== undefined) session.description = settings.description || undefined;
  if (settings.listed !== undefined) session.listed = settings.listed;

  if (session.listed && !session.name) {
    session.listed = false;
    return { type: 'error', message: 'A session name is required to be listed.' };
  }

  broadcast(session, {
    type: 'sessionSettingsUpdated',
    name: session.name ?? null,
    description: session.description ?? null,
    listed: !!session.listed,
  });
  return null;
}

// ── Session lifecycle ───────────────────────────────────────────────────────

function destroySession(session: Session, closeReason: string) {
  clearInterval(session.transitionTimer);

  // Clean up global identity token index for this session's tokens
  if (session.members) {
    for (const token of session.members.keys()) {
      identityTokenIndex.delete(token);
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
      const closeReason = inactiveExpired ? 'inactive 10 days' : 'empty 24 hours';
      const clientCount = session.clients.size;
      destroySession(session, inactiveExpired ? 'Session expired due to inactivity.' : `Session closed after being empty for ${EMPTY_SESSION_TTL_MS / 3_600_000} hours.`);
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
