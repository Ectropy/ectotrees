import express from 'express';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { URL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { version as PKG_VERSION } from '../package.json' with { type: 'json' };
import type { ClientMessage, ServerMessage } from '../shared/protocol.ts';
import {
  applySetSpawnTimer,
  applySetTreeInfo,
  applyUpdateTreeFields,
  applyUpdateHealth,
  applyMarkDead,
  applyReportLightning,
} from '../shared/mutations.ts';
import {
  createSession,
  getSession,
  getSessionEntries,
  addClient,
  removeClient,
  setClientType,
  updateWorldState,
  handleReportWorld,
  cleanupExpiredSessions,
  getSessionCount,
  getTotalClientCount,
  forkToManaged,
  selfRegisterMember,
  lookupInviteToken,
  addMemberConnection,
  canWrite,
  createInvite,
  banMember,
  renameMember,
  setMemberRole,
  transferOwnership,
  setAllowViewers,
  requestPersonalToken,
} from './session.ts';
import { validateMessage, validateSessionCode, validateInviteToken } from './validation.ts';
import { log, warn } from './log.ts';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');
const MAX_MESSAGE_SIZE = 4096;           // 4 KB (normal messages)
const MAX_INIT_MESSAGE_SIZE = 64 * 1024; // 64 KB (initializeState)
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX = 10;
const HTTP_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window
const HTTP_RATE_LIMIT_MAX = 20;           // requests per window per IP
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_TIMEOUT_MS = 90_000;

// --- Protocol version stamp ---
const _protocolPath = fileURLToPath(new URL('../shared/protocol.ts', import.meta.url));
const _protocolHash = createHash('sha256').update(fs.readFileSync(_protocolPath)).digest('hex').slice(0, 8);
const SERVER_VERSION = `${PKG_VERSION}+${_protocolHash}`;
log(`[server] version ${SERVER_VERSION}`);

function errorMsg(message: string): ServerMessage {
  return { type: 'error', message, serverVersion: SERVER_VERSION };
}

// --- Origin allowlist ---

const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = new Set([
  'https://trees.ectropyarts.com',
  'https://ectotrees.ectropyarts.com',
  ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(',').map(s => s.trim()) : []),
]);

function isOriginAllowed(origin: string | undefined): boolean {
  if (!IS_PROD) return true; // dev: allow all (handles localhost + any LAN IP from --host)
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

// --- Rate limiting ---

interface RateState {
  count: number;
  windowStart: number;
}

// WebSocket: per-connection, stored on the socket object
const wsRateLimits = new WeakMap<WebSocket, RateState>();

function checkRateLimit(ws: WebSocket): boolean {
  const now = Date.now();
  let state = wsRateLimits.get(ws);
  if (!state || now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    state = { count: 1, windowStart: now };
    wsRateLimits.set(ws, state);
    return true;
  }
  state.count++;
  return state.count <= RATE_LIMIT_MAX;
}

// HTTP: per-IP sliding window, applied to session REST endpoints
const httpRateLimits = new Map<string, RateState>();

function checkHttpRateLimit(ip: string): boolean {
  const now = Date.now();
  let state = httpRateLimits.get(ip);
  if (!state || now - state.windowStart > HTTP_RATE_LIMIT_WINDOW_MS) {
    httpRateLimits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  state.count++;
  return state.count <= HTTP_RATE_LIMIT_MAX;
}

function httpRateLimitMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (!checkHttpRateLimit(ip)) {
    res.status(429).json({ error: 'Too many requests.' });
    return;
  }
  next();
}

// --- Express app ---

const app = express();
// Trust the first hop (Caddy reverse proxy) so req.ip reflects the real client IP.
app.set('trust proxy', 1);
app.use(express.json({ limit: '1kb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

app.post('/api/session', httpRateLimitMiddleware, (_req, res) => {
  const result = createSession();
  if ('error' in result) {
    res.status(503).json({ error: result.error });
    return;
  }

  log(`[session] Created ${result.code} (${getSessionCount()} active sessions)`);
  res.json({ code: result.code });
});


app.post('/api/session/:code/self-invite', httpRateLimitMiddleware, (req, res) => {
  const code = validateSessionCode(req.params.code);
  if (!code) { res.status(400).json({ error: 'Invalid session code.' }); return; }
  const session = getSession(code);
  if (!session) { res.status(404).json({ error: 'Session not found.' }); return; }
  const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
  const name = rawName.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 30);
  if (!name) { res.status(400).json({ error: 'Name is required.' }); return; }
  const selfRegisterToken = typeof req.body?.selfRegisterToken === 'string' ? req.body.selfRegisterToken : '';
  if (!selfRegisterToken) { res.status(400).json({ error: 'Self-registration token is required.' }); return; }
  const personalToken = typeof req.body?.personalToken === 'string' ? req.body.personalToken : undefined;
  const result = selfRegisterMember(session, name, selfRegisterToken, personalToken);
  if ('error' in result) { res.status(400).json({ error: result.error }); return; }
  log(`[self-invite] ${code} — "${name}" self-registered`);

  // If a personal token was migrated, redirect scout connections in the anonymous session
  if (personalToken && result.inviteToken === personalToken) {
    // Find the anonymous session that owns this token and redirect its connections
    for (const [, s] of Array.from(getSessionEntries())) {
      if (s.managed) continue;
      for (const [ws, tok] of s.wsToInviteToken) {
        if (tok === personalToken && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'redirect', code } as import('../shared/protocol.ts').ServerMessage));
        }
      }
    }
  }

  res.json({ inviteToken: result.inviteToken });
});

app.get('/api/health', (_req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const h = Math.floor(uptimeSeconds / 3600);
  const m = Math.floor((uptimeSeconds % 3600) / 60);
  const s = uptimeSeconds % 60;
  const uptimeHuman = h > 0
    ? `${h}h ${m}m ${s}s`
    : m > 0 ? `${m}m ${s}s` : `${s}s`;
  res.json({
    ok: true,
    version: SERVER_VERSION,
    uptimeSeconds,
    uptime: uptimeHuman,
    sessions: getSessionCount(),
    clients: getTotalClientCount(),
  });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api|ws).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// --- Error handler ---

// Catches errors thrown by middleware (e.g. body-parser's 413) and returns
// a consistent JSON response instead of Express's default HTML error page.
app.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.status === 413 || err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large.' });
    return;
  }
  res.status(500).json({ error: 'Internal server error.' });
});

// --- HTTP + WS server ---

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!isOriginAllowed(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    socket.destroy();
    return;
  }

  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  // Invite token connect: managed session member joins via ?invite=
  const rawInviteToken = url.searchParams.get('invite');
  if (rawInviteToken !== null) {
    const inviteToken = validateInviteToken(rawInviteToken);
    if (!inviteToken) {
      socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    const resolved = lookupInviteToken(inviteToken);
    if (!resolved) {
      socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    if (resolved.member.banned) {
      socket.write('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, resolved.session, resolved.session.code, resolved.member);
    });
    return;
  }

  // Normal session code connect
  const code = validateSessionCode(url.searchParams.get('code'));
  if (!code) {
    socket.destroy();
    return;
  }

  const session = getSession(code);
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, session, code);
  });
});

wss.on('connection', (ws: WebSocket, _req: unknown, session: ReturnType<typeof getSession>, attemptedCode: string, inviteMember?: import('./session.ts').Member) => {
  if (!session) {
    log(`[connect] Rejected — session ${attemptedCode} not found`);
    ws.send(JSON.stringify(errorMsg('Session not found.')));
    ws.close(1008, 'Session not found');
    return;
  }
  const activeSession = session;

  // Block anonymous connections to managed sessions (unless allowViewers is on)
  if (activeSession.managed && !inviteMember && !activeSession.allowViewers) {
    log(`[connect] Rejected — ${activeSession.code} is managed and requires invite`);
    ws.send(JSON.stringify(errorMsg('This is a private session. You need an invite link to join.')));
    ws.close(1008, 'Invite required');
    return;
  }

  // Invite token connect: add as managed session member
  let clientId: number | false;
  if (inviteMember) {
    clientId = addMemberConnection(activeSession, ws, inviteMember);
    if (clientId === false) {
      log(`[connect] Rejected — ${activeSession.code} is full (${activeSession.clients.size} clients)`);
      ws.send(JSON.stringify(errorMsg('Session is full.')));
      ws.close();
      return;
    }
    log(`[connect] Member "${inviteMember.name}" (${inviteMember.role}) joined ${activeSession.code} via invite`);
  } else {
    clientId = addClient(activeSession, ws);
    if (clientId === false) {
      log(`[connect] Rejected — ${activeSession.code} is full (${activeSession.clients.size} clients)`);
      ws.send(JSON.stringify(errorMsg('Session is full.')));
      ws.close();
      return;
    }

  }

  log(`[connect] Client ${clientId} joined ${activeSession.code} — ${activeSession.clients.size} clients in session, ${getTotalClientCount()} clients across all sessions`);

  // Heartbeat tracking
  let lastPong = Date.now();
  let serverCloseReason: string | null = null;
  ws.on('pong', () => { lastPong = Date.now(); });

  const heartbeatCheck = setInterval(() => {
    if (Date.now() - lastPong > HEARTBEAT_TIMEOUT_MS) {
      serverCloseReason = 'heartbeat timeout (no pong)';
      ws.terminate();
      return;
    }
    ws.ping();
  }, 30_000);

  let removed = false;
  function finalizeDisconnect() {
    if (removed) return;
    removed = true;
    clearInterval(heartbeatCheck);
    removeClient(activeSession, ws);
  }

  ws.on('message', (data) => {
    // Ignore (and close) sockets no longer tracked by this session.
    if (!activeSession.clients.has(ws)) {
      warn(`[error] Client ${clientId} sent message after removal from ${activeSession.code} — closing`);
      ws.close();
      return;
    }

    // Size check (allow larger messages for initializeState)
    const raw = data.toString();
    const sizeLimit = (raw.includes('"initializeState"') || raw.includes('"contributeWorlds"')) ? MAX_INIT_MESSAGE_SIZE : MAX_MESSAGE_SIZE;
    if (raw.length > sizeLimit) {
      ws.send(JSON.stringify(errorMsg('Message too large.')));
      return;
    }

    // Rate limit
    if (!checkRateLimit(ws)) {
      ws.send(JSON.stringify(errorMsg('Rate limit exceeded.')));
      return;
    }

    // Parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify(errorMsg('Invalid JSON.')));
      return;
    }

    // Validate
    const validated = validateMessage(parsed);
    if ('error' in validated) {
      ws.send(JSON.stringify(errorMsg(validated.error)));
      return;
    }

    handleMessage(activeSession, validated, ws, clientId);
  });

  ws.on('close', (_code, reasonBuffer) => {
    finalizeDisconnect();
    const rawReason = reasonBuffer.length > 0 ? reasonBuffer.toString('utf8') : '';
    const reason = rawReason || serverCloseReason || '';
    const suffix = reason ? ` — ${reason}` : '';
    log(`[disconnect] Client ${clientId} left ${activeSession.code}${suffix} — ${activeSession.clients.size} remaining in session, ${getTotalClientCount()} clients across all sessions`);
  });

  ws.on('error', (err) => {
    log(`[error] Client ${clientId} on ${activeSession.code}: ${err.message}`);
    // Ensure close runs promptly so cleanup and UI updates are not delayed.
    if (ws.readyState !== 3) { // WebSocket.CLOSED
      ws.terminate();
    }
  });
});

const MUTATION_TYPES = new Set(['setSpawnTimer', 'setTreeInfo', 'updateTreeFields', 'updateHealth', 'reportLightning', 'markDead', 'clearWorld', 'contributeWorlds', 'initializeState']);

function handleMessage(session: NonNullable<ReturnType<typeof getSession>>, msg: ClientMessage, ws: WebSocket, clientId: number) {
  const now = Date.now();
  const c = `Client ${clientId}`;

  // Write permission check for managed sessions
  if (MUTATION_TYPES.has(msg.type) && !canWrite(session, ws)) {
    ws.send(JSON.stringify(errorMsg('Permission denied. Viewers cannot modify session data.')));
    return;
  }

  switch (msg.type) {
    case 'ping': {
      const pong: ServerMessage = { type: 'pong' };
      ws.send(JSON.stringify(pong));
      break;
    }

    case 'identify': {
      setClientType(session, ws, msg.clientType);
      break;
    }

    case 'requestPersonalToken': {
      const result = requestPersonalToken(session, ws);
      ws.send(JSON.stringify(result));
      if (result.type === 'personalToken') {
        log(`[personal] ${session.code} ${c} generated personal token ${result.token.slice(0, 4)}…`);
      }
      break;
    }

    case 'reportWorld': {
      handleReportWorld(session, ws, msg.worldId);
      break;
    }

    case 'forkToManaged': {
      const result = forkToManaged(session, ws, msg.name);
      if ('error' in result) {
        ws.send(JSON.stringify(errorMsg(result.error)));
      } else {
        // Tell the initiator which session to join and provide their owner token
        const forkCreatedMsg: ServerMessage = { type: 'forkCreated', managedCode: result.managedCode, ownerToken: result.ownerToken };
        ws.send(JSON.stringify(forkCreatedMsg));
        log(`[fork] ${session.code} ${c} forked to managed session ${result.managedCode} as "${msg.name}"`);
      }
      break;
    }

    case 'createInvite': {
      const result = createInvite(session, ws, msg.name, msg.role);
      if (result.type === 'error') {
        ws.send(JSON.stringify(result));
      } else {
        ws.send(JSON.stringify(result));
        log(`[managed] ${session.code} ${c} created invite for "${msg.name}" (${msg.role ?? 'scout'})`);
      }
      break;
    }

    case 'banMember': {
      const err = banMember(session, ws, msg.inviteToken);
      if (err) {
        ws.send(JSON.stringify(err));
      } else {
        log(`[managed] ${session.code} ${c} banned member ${msg.inviteToken.slice(0, 4)}…`);
      }
      break;
    }

    case 'renameMember': {
      const err = renameMember(session, ws, msg.inviteToken, msg.name);
      if (err) {
        ws.send(JSON.stringify(err));
      } else {
        log(`[managed] ${session.code} ${c} renamed member ${msg.inviteToken.slice(0, 4)}… to "${msg.name}"`);
      }
      break;
    }

    case 'setMemberRole': {
      const err = setMemberRole(session, ws, msg.inviteToken, msg.role);
      if (err) {
        ws.send(JSON.stringify(err));
      } else {
        log(`[managed] ${session.code} ${c} set role ${msg.role} for ${msg.inviteToken.slice(0, 4)}…`);
      }
      break;
    }

    case 'transferOwnership': {
      const err = transferOwnership(session, ws, msg.inviteToken);
      if (err) {
        ws.send(JSON.stringify(err));
      } else {
        log(`[managed] ${session.code} ${c} transferred ownership to ${msg.inviteToken.slice(0, 4)}…`);
      }
      break;
    }

    case 'setAllowViewers': {
      const err = setAllowViewers(session, ws, msg.allow);
      if (err) ws.send(JSON.stringify(err));
      else log(`[managed] ${session.code} ${c} setAllowViewers ${msg.allow}`);
      break;
    }

    case 'setSpawnTimer': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} setSpawnTimer ${Math.round(msg.msFromNow / 1000)}s${msg.treeInfo?.treeHint ? ` hint="${msg.treeInfo.treeHint}"` : ''}`);
      const next = applySetSpawnTimer(session.worldStates, msg.worldId, msg.msFromNow, now, msg.treeInfo);
      updateWorldState(session, msg.worldId, next[msg.worldId], ws);
      break;
    }

    case 'setTreeInfo': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} setTreeInfo ${msg.info.treeType}${msg.info.treeHealth ? ` ${msg.info.treeHealth}%` : ''}`);
      const next = applySetTreeInfo(session.worldStates, msg.worldId, msg.info, now);
      updateWorldState(session, msg.worldId, next[msg.worldId], ws);
      break;
    }

    case 'updateTreeFields': {
      const fields = Object.keys(msg.fields).join(', ');
      log(`[mutation] ${session.code} ${c} W${msg.worldId} updateTreeFields [${fields}]`);
      const next = applyUpdateTreeFields(session.worldStates, msg.worldId, msg.fields, now);
      if (next !== session.worldStates) {
        updateWorldState(session, msg.worldId, next[msg.worldId], ws);
      }
      break;
    }

    case 'updateHealth': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} updateHealth ${msg.health ?? 'clear'}`);
      const next = applyUpdateHealth(session.worldStates, msg.worldId, msg.health);
      if (next !== session.worldStates) {
        updateWorldState(session, msg.worldId, next[msg.worldId], ws);
      }
      break;
    }

    case 'reportLightning': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} reportLightning ${msg.health}%`);
      const next = applyReportLightning(session.worldStates, msg.worldId, msg.health, now);
      if (next !== session.worldStates) {
        updateWorldState(session, msg.worldId, next[msg.worldId], ws);
      }
      break;
    }

    case 'markDead': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} markDead`);
      const next = applyMarkDead(session.worldStates, msg.worldId, now);
      updateWorldState(session, msg.worldId, next[msg.worldId], ws);
      break;
    }

    case 'clearWorld': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} clearWorld`);
      updateWorldState(session, msg.worldId, null, ws);
      break;
    }

    case 'initializeState': {
      // Only allow when session has no world data (fresh session)
      if (Object.keys(session.worldStates).length > 0) {
        ws.send(JSON.stringify(errorMsg('Session already has state.')));
        break;
      }
      const count = Object.keys(msg.worlds).length;
      log(`[session] ${session.code} ${c} initialized with data for ${count} worlds`);
      session.worldStates = msg.worlds;
      session.lastActivityAt = Date.now();
      break;
    }

    case 'contributeWorlds': {
      const entries = Object.entries(msg.worlds);
      const toAdd = entries.filter(([id]) => !(Number(id) in session.worldStates));
      const addedIds = toAdd.map(([id]) => `W${id}`).join(', ');
      const skipped = entries.length - toAdd.length;
      log(`[mutation] ${session.code} ${c} contributeWorlds: ${toAdd.length}/${entries.length} added${addedIds ? ` [${addedIds}]` : ''}${skipped > 0 ? ` (${skipped} skipped, already present)` : ''}`);
      for (const [id, state] of toAdd) {
        updateWorldState(session, Number(id), state);
      }
      break;
    }
  }

  // Send ACK if the client included a msgId (pairing/managed messages don't use ACK)
  const noAckTypes = new Set(['ping', 'initializeState', 'identify', 'reportWorld', 'createInvite', 'banMember', 'renameMember', 'setMemberRole', 'transferOwnership']);
  const msgId = (msg as { msgId?: number }).msgId;
  if (!noAckTypes.has(msg.type) && msgId !== undefined && ws.readyState === 1) {
    const ack: ServerMessage = { type: 'ack', msgId };
    ws.send(JSON.stringify(ack));
  }
}

// --- Periodic cleanup ---

setInterval(() => {
  cleanupExpiredSessions();
  // Evict stale HTTP rate limit entries (IPs whose window has long expired)
  const now = Date.now();
  for (const [ip, state] of httpRateLimits) {
    if (now - state.windowStart > HTTP_RATE_LIMIT_WINDOW_MS) {
      httpRateLimits.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

// --- Start ---

server.listen(PORT, () => {
  log(`Server listening on port ${PORT} (log timezone: ${process.env.LOG_TZ ?? 'America/New_York'})`);
});

function shutdown(signal: string) {
  log(`${signal} — shutting down (${getSessionCount()} sessions destroyed, ${getTotalClientCount()} clients disconnected)`);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
