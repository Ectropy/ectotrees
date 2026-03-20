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
  addMemberConnection,
  canWrite,
  createInvite,
  banMember,
  renameMember,
  setMemberRole,
  transferOwnership,
  setAllowViewers,
  requestPersonalToken,
  authenticateByCode,
  authenticateByInviteToken,
  authenticateByPersonalToken,
  MAX_CLIENTS_PER_SESSION,
} from './session.ts';
import { validateMessage, validateSessionCode, validateAuthMessage } from './validation.ts';
import type { Session, Member } from './session.ts';
import { log } from './log.ts';

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
const AUTH_TIMEOUT_MS = 10_000; // 10 seconds

// --- Per-connection state for message-based authentication ---
interface WsExtensions {
  authenticated: boolean;
  authTimeout?: ReturnType<typeof setTimeout>;
  session?: Session;
  member?: Member;
  rateLimitMessages: number[];
  clientId?: number;
}
const wsExtensions = new WeakMap<WebSocket, WsExtensions>();

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

function checkRateLimit(ws: WebSocket): boolean {
  const now = Date.now();
  const extensions = wsExtensions.get(ws);
  if (!extensions) return false;

  // Sliding window: keep only timestamps within the current window
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  extensions.rateLimitMessages = extensions.rateLimitMessages.filter(t => t > cutoff);
  extensions.rateLimitMessages.push(now);
  return extensions.rateLimitMessages.length <= RATE_LIMIT_MAX;
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
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
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss:; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
  next();
});

// CSRF protection: POST requests must include X-Requested-With header.
// This forces a CORS preflight, blocking cross-origin form submissions.
function csrfMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method === 'POST' && !req.headers['x-requested-with']) {
    res.status(403).json({ error: 'Missing X-Requested-With header.' });
    return;
  }
  next();
}

app.post('/api/session', csrfMiddleware, httpRateLimitMiddleware, (_req, res) => {
  const result = createSession();
  if ('error' in result) {
    res.status(503).json({ error: result.error });
    return;
  }

  log(`[session] Created ${result.code} (${getSessionCount()} active sessions)`);
  res.json({ code: result.code });
});


app.post('/api/session/:code/self-invite', csrfMiddleware, httpRateLimitMiddleware, (req, res) => {
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

  // Accept all WebSocket connections; authentication happens via message-based auth
  wss.handleUpgrade(req, socket, head, (ws) => {
    // Initialize unauthenticated connection with auth timeout
    const extensions: WsExtensions = {
      authenticated: false,
      rateLimitMessages: [],
    };

    extensions.authTimeout = setTimeout(() => {
      if (!extensions.authenticated) {
        ws.send(JSON.stringify({ type: 'authError', reason: 'Authentication required. Send an auth message within 10 seconds.', code: 'timeout' }));
        ws.close(1008, 'Authentication timeout');
      }
    }, AUTH_TIMEOUT_MS);

    wsExtensions.set(ws, extensions);
    wss.emit('connection', ws, req);
  });
});

// Handle authentication messages from unauthenticated clients
function handleAuthMessage(ws: WebSocket, msg: { type: 'authSession' | 'authInvite' | 'authPersonal' }): void {
  const extensions = wsExtensions.get(ws);
  if (!extensions) {
    ws.send(JSON.stringify({ type: 'authError', reason: 'Internal server error.' }));
    ws.close();
    return;
  }

  let session: Session | { error: string };
  let member: Member | undefined;

  if (msg.type === 'authSession') {
    session = authenticateByCode((msg as unknown as { code: string }).code);
  } else if (msg.type === 'authInvite') {
    const result = authenticateByInviteToken((msg as unknown as { token: string }).token);
    if ('error' in result) {
      session = result;
    } else {
      session = result.session;
      member = result.member;
    }
  } else if (msg.type === 'authPersonal') {
    const result = authenticateByPersonalToken((msg as unknown as { token: string }).token);
    if ('error' in result) {
      session = result;
    } else {
      session = result.session;
      member = result.member;
    }
  } else {
    ws.send(JSON.stringify({ type: 'authError', reason: 'Unknown auth type.' }));
    ws.close();
    return;
  }

  if ('error' in session) {
    const errorResult = session as { error: string };
    let code: 'invalid' | 'expired' | 'full' | 'banned' = 'invalid';
    if (errorResult.error.includes('expired')) code = 'expired';
    else if (errorResult.error.includes('full')) code = 'full';
    else if (errorResult.error.includes('banned')) code = 'banned';

    ws.send(JSON.stringify({ type: 'authError', reason: errorResult.error, code }));
    ws.close(code === 'full' ? 1003 : 1008, errorResult.error);
    return;
  }

  // session is now guaranteed to be Session (not error type)
  const validatedSession = session as Session;

  // Check if session is full
  if (validatedSession.clients.size >= MAX_CLIENTS_PER_SESSION) {
    ws.send(JSON.stringify({ type: 'authError', reason: 'Session is full.', code: 'full' }));
    ws.close(1003, 'Session is full');
    return;
  }

  // Check if managed session allows anonymous connections
  if (validatedSession.managed && !member && !validatedSession.allowViewers) {
    ws.send(JSON.stringify({ type: 'authError', reason: 'This is a private session. You need an invite link to join.', code: 'banned' }));
    ws.close(1008, 'Invite required');
    return;
  }

  // Add connection to session
  let clientId: number;
  if (member) {
    const memberResult = addMemberConnection(validatedSession, ws, member);
    if (memberResult === false) {
      ws.send(JSON.stringify({ type: 'authError', reason: 'Session is full.', code: 'full' }));
      ws.close(1003, 'Session is full');
      return;
    }
    clientId = memberResult;
    log(`[connect] Member "${member.name}" (${member.role}) joined ${validatedSession.code} via auth`);
  } else {
    const clientResult = addClient(validatedSession, ws);
    if (clientResult === false) {
      ws.send(JSON.stringify({ type: 'authError', reason: 'Session is full.', code: 'full' }));
      ws.close(1003, 'Session is full');
      return;
    }
    clientId = clientResult;
    log(`[connect] Client ${clientId} joined ${validatedSession.code} — ${validatedSession.clients.size} clients in session, ${getTotalClientCount()} clients across all sessions`);
  }

  // Mark as authenticated
  extensions.authenticated = true;
  extensions.session = validatedSession;
  extensions.member = member;
  extensions.clientId = clientId;
  if (extensions.authTimeout) {
    clearTimeout(extensions.authTimeout);
    extensions.authTimeout = undefined;
  }

  // Send auth success response (with personal token if applicable)
  const personalToken = member ? validatedSession.wsToInviteToken.get(ws) : undefined;
  ws.send(JSON.stringify({ type: 'authSuccess', sessionCode: validatedSession.code, personalToken }));
}

wss.on('connection', (ws: WebSocket, _req: unknown) => {
  const extensions = wsExtensions.get(ws);
  if (!extensions) {
    ws.close();
    return;
  }

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
    const ext = wsExtensions.get(ws);
    if (ext) {
      if (ext.authTimeout) {
        clearTimeout(ext.authTimeout);
      }
      if (ext.session && ext.session.clients.has(ws)) {
        removeClient(ext.session, ws);
      }
    }
    wsExtensions.delete(ws);
  }

  ws.on('message', (data) => {
    // Parse message
    const raw = data.toString();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify(errorMsg('Invalid JSON.')));
      return;
    }

    // Size check (allow larger messages for initializeState)
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

    // Handle auth messages (even when unauthenticated)
    const authValidated = validateAuthMessage(parsed);
    if (!('error' in authValidated)) {
      handleAuthMessage(ws, authValidated as { type: 'authSession' | 'authInvite' | 'authPersonal' });
      return;
    }

    // Reject non-auth messages if not authenticated
    if (!extensions.authenticated) {
      ws.send(JSON.stringify({ type: 'authError', reason: 'Authentication required.', code: 'invalid' }));
      ws.close(1008, 'Authentication required');
      return;
    }

    // Validate non-auth messages
    const validated = validateMessage(parsed);
    if ('error' in validated) {
      ws.send(JSON.stringify(errorMsg(validated.error)));
      return;
    }

    const ext = wsExtensions.get(ws);
    if (!ext || !ext.session || ext.clientId === undefined) {
      ws.send(JSON.stringify(errorMsg('Connection not authenticated.')));
      ws.close();
      return;
    }

    try {
      handleMessage(ext.session, validated, ws, ext.clientId);
    } catch (err) {
      log(`[error] Unhandled error in message handler: ${err instanceof Error ? err.message : String(err)}`);
      ws.send(JSON.stringify(errorMsg('Internal server error.')));
    }
  });

  ws.on('close', (_code, reasonBuffer) => {
    const ext = wsExtensions.get(ws);
    const sessionCode = ext?.session?.code ?? 'unknown';
    const clientId = ext?.clientId ?? 'unknown';
    finalizeDisconnect();
    const rawReason = reasonBuffer.length > 0 ? reasonBuffer.toString('utf8') : '';
    const reason = rawReason || serverCloseReason || '';
    const suffix = reason ? ` — ${reason}` : '';
    log(`[disconnect] Client ${clientId} left ${sessionCode}${suffix}`);
  });

  ws.on('error', (err) => {
    const ext = wsExtensions.get(ws);
    const sessionCode = ext?.session?.code ?? 'unknown';
    const clientId = ext?.clientId ?? 'unknown';
    log(`[error] Client ${clientId} on ${sessionCode}: ${err.message}`);
    if (ws.readyState !== 3) { // WebSocket.CLOSED
      ws.terminate();
    }
  });
});

const MUTATION_TYPES = new Set(['setSpawnTimer', 'setTreeInfo', 'updateTreeFields', 'updateHealth', 'reportLightning', 'markDead', 'clearWorld', 'contributeWorlds', 'initializeState']);

function handleMessage(session: Session, msg: ClientMessage, ws: WebSocket, clientId: number) {
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
      for (const [id, state] of Object.entries(msg.worlds)) {
        updateWorldState(session, Number(id), state, ws);
      }
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
