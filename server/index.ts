import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { URL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import type { ClientMessage, ServerMessage } from '../shared/protocol.ts';
import {
  applySetSpawnTimer,
  applySetTreeInfo,
  applyUpdateTreeFields,
  applyUpdateHealth,
  applyMarkDead,
} from '../shared/mutations.ts';
import {
  createSession,
  getSession,
  addClient,
  removeClient,
  updateWorldState,
  cleanupExpiredSessions,
  getSessionCount,
  getTotalClientCount,
} from './session.ts';
import { validateMessage, validateSessionCode } from './validation.ts';
import { log, warn } from './log.ts';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');
const MAX_MESSAGE_SIZE = 4096;           // 4 KB (normal messages)
const MAX_INIT_MESSAGE_SIZE = 64 * 1024; // 64 KB (initializeState)
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX = 10;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HEARTBEAT_TIMEOUT_MS = 90_000;

// --- Rate limiting ---

interface RateState {
  count: number;
  windowStart: number;
}

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

// --- Express app ---

const app = express();
app.use(express.json({ limit: '1kb' }));

app.post('/api/session', (_req, res) => {
  const result = createSession();
  if ('error' in result) {
    res.status(503).json({ error: result.error });
    return;
  }

  log(`[session] Created ${result.code} (${getSessionCount()} active sessions)`);
  res.json({ code: result.code });
});

app.get('/api/session/:code', (req, res) => {
  const code = validateSessionCode(req.params.code);
  if (!code) {
    log(`[session] Lookup rejected for invalid code "${req.params.code}"`);
    res.status(400).json({ error: 'Invalid session code.' });
    return;
  }
  const session = getSession(code);
  if (!session) {
    log(`[session] Lookup failed for ${code}: not found`);
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  res.json({ code: session.code, clientCount: session.clients.size });
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

// --- HTTP + WS server ---

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

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

wss.on('connection', (ws: WebSocket, _req: unknown, session: ReturnType<typeof getSession>, attemptedCode: string) => {
  if (!session) {
    log(`[connect] Rejected — session ${attemptedCode} not found`);
    const msg: ServerMessage = { type: 'error', message: 'Session not found.' };
    ws.send(JSON.stringify(msg));
    ws.close(1008, 'Session not found');
    return;
  }
  const activeSession = session;

  const clientId = addClient(activeSession, ws);
  if (clientId === false) {
    log(`[connect] Rejected — ${activeSession.code} is full (${activeSession.clients.size} clients)`);
    const msg: ServerMessage = { type: 'error', message: 'Session is full.' };
    ws.send(JSON.stringify(msg));
    ws.close();
    return;
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
      const msg: ServerMessage = { type: 'error', message: 'Message too large.' };
      ws.send(JSON.stringify(msg));
      return;
    }

    // Rate limit
    if (!checkRateLimit(ws)) {
      const msg: ServerMessage = { type: 'error', message: 'Rate limit exceeded.' };
      ws.send(JSON.stringify(msg));
      return;
    }

    // Parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const msg: ServerMessage = { type: 'error', message: 'Invalid JSON.' };
      ws.send(JSON.stringify(msg));
      return;
    }

    // Validate
    const validated = validateMessage(parsed);
    if ('error' in validated) {
      const msg: ServerMessage = { type: 'error', message: validated.error };
      ws.send(JSON.stringify(msg));
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

function handleMessage(session: NonNullable<ReturnType<typeof getSession>>, msg: ClientMessage, ws: WebSocket, clientId: number) {
  const now = Date.now();
  const c = `Client ${clientId}`;

  switch (msg.type) {
    case 'ping': {
      const pong: ServerMessage = { type: 'pong' };
      ws.send(JSON.stringify(pong));
      break;
    }

    case 'setSpawnTimer': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} setSpawnTimer ${Math.round(msg.msFromNow / 1000)}s${msg.treeInfo?.treeHint ? ` hint="${msg.treeInfo.treeHint}"` : ''}`);
      const next = applySetSpawnTimer(session.worldStates, msg.worldId, msg.msFromNow, now, msg.treeInfo);
      updateWorldState(session, msg.worldId, next[msg.worldId]);
      break;
    }

    case 'setTreeInfo': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} setTreeInfo ${msg.info.treeType}${msg.info.treeHealth ? ` ${msg.info.treeHealth}%` : ''}`);
      const next = applySetTreeInfo(session.worldStates, msg.worldId, msg.info, now);
      updateWorldState(session, msg.worldId, next[msg.worldId]);
      break;
    }

    case 'updateTreeFields': {
      const fields = Object.keys(msg.fields).join(', ');
      log(`[mutation] ${session.code} ${c} W${msg.worldId} updateTreeFields [${fields}]`);
      const next = applyUpdateTreeFields(session.worldStates, msg.worldId, msg.fields);
      if (next !== session.worldStates) {
        updateWorldState(session, msg.worldId, next[msg.worldId]);
      }
      break;
    }

    case 'updateHealth': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} updateHealth ${msg.health ?? 'clear'}`);
      const next = applyUpdateHealth(session.worldStates, msg.worldId, msg.health);
      if (next !== session.worldStates) {
        updateWorldState(session, msg.worldId, next[msg.worldId]);
      }
      break;
    }

    case 'markDead': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} markDead`);
      const next = applyMarkDead(session.worldStates, msg.worldId, now);
      updateWorldState(session, msg.worldId, next[msg.worldId]);
      break;
    }

    case 'clearWorld': {
      log(`[mutation] ${session.code} ${c} W${msg.worldId} clearWorld`);
      updateWorldState(session, msg.worldId, null);
      break;
    }

    case 'initializeState': {
      // Only allow when session has no world data (fresh session)
      if (Object.keys(session.worldStates).length > 0) {
        const err: ServerMessage = { type: 'error', message: 'Session already has state.' };
        ws.send(JSON.stringify(err));
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

  // Send ACK if the client included a msgId
  if (msg.type !== 'ping' && msg.type !== 'initializeState' && msg.msgId !== undefined && ws.readyState === 1) {
    const ack: ServerMessage = { type: 'ack', msgId: msg.msgId };
    ws.send(JSON.stringify(ack));
  }
}

// --- Periodic cleanup ---

setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);

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
