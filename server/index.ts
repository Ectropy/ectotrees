import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { URL } from 'node:url';
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
} from './session.ts';
import { validateMessage, validateSessionCode } from './validation.ts';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const MAX_MESSAGE_SIZE = 4096; // 4 KB
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

// --- IP rate limiting for session creation ---

const ipSessionCreates = new Map<string, { count: number; windowStart: number }>();
const IP_SESSION_LIMIT = 5;
const IP_SESSION_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkIpSessionLimit(ip: string): boolean {
  const now = Date.now();
  let state = ipSessionCreates.get(ip);
  if (!state || now - state.windowStart > IP_SESSION_WINDOW_MS) {
    state = { count: 1, windowStart: now };
    ipSessionCreates.set(ip, state);
    return true;
  }
  state.count++;
  return state.count <= IP_SESSION_LIMIT;
}

// --- Express app ---

const app = express();
app.use(express.json({ limit: '1kb' }));

app.post('/api/session', (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  if (!checkIpSessionLimit(ip)) {
    res.status(429).json({ error: 'Too many sessions created. Try again later.' });
    return;
  }

  const result = createSession();
  if ('error' in result) {
    res.status(503).json({ error: result.error });
    return;
  }

  console.log(`[session] Created ${result.code} (from ${ip})`);
  res.json({ code: result.code });
});

app.get('/api/session/:code', (req, res) => {
  const code = validateSessionCode(req.params.code);
  if (!code) {
    res.status(400).json({ error: 'Invalid session code.' });
    return;
  }
  const session = getSession(code);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  res.json({ code: session.code, clientCount: session.clients.size });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sessions: getSessionCount() });
});

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
  if (!session) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, session);
  });
});

wss.on('connection', (ws: WebSocket, _req: unknown, session: ReturnType<typeof getSession>) => {
  if (!session) {
    ws.close();
    return;
  }

  if (!addClient(session, ws)) {
    console.log(`[ws] Rejected connection to ${session.code} (full, ${session.clients.size} clients)`);
    const msg: ServerMessage = { type: 'error', message: 'Session is full.' };
    ws.send(JSON.stringify(msg));
    ws.close();
    return;
  }

  console.log(`[ws] Client connected to ${session.code} (${session.clients.size} clients)`);

  // Heartbeat tracking
  let lastPong = Date.now();
  ws.on('pong', () => { lastPong = Date.now(); });

  const heartbeatCheck = setInterval(() => {
    if (Date.now() - lastPong > HEARTBEAT_TIMEOUT_MS) {
      ws.terminate();
      return;
    }
    ws.ping();
  }, 30_000);

  ws.on('message', (data) => {
    // Size check
    const raw = data.toString();
    if (raw.length > MAX_MESSAGE_SIZE) {
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

    handleMessage(session, validated, ws);
  });

  ws.on('close', () => {
    clearInterval(heartbeatCheck);
    removeClient(session, ws);
    console.log(`[ws] Client disconnected from ${session.code} (${session.clients.size} clients)`);
  });

  ws.on('error', (err) => {
    clearInterval(heartbeatCheck);
    removeClient(session, ws);
    console.log(`[ws] Client error on ${session.code}: ${err.message} (${session.clients.size} clients)`);
  });
});

function handleMessage(session: NonNullable<ReturnType<typeof getSession>>, msg: ClientMessage, ws: WebSocket) {
  const now = Date.now();

  switch (msg.type) {
    case 'ping': {
      const pong: ServerMessage = { type: 'pong' };
      ws.send(JSON.stringify(pong));
      break;
    }

    case 'setSpawnTimer': {
      console.log(`[mutation] ${session.code} W${msg.worldId} setSpawnTimer ${Math.round(msg.msFromNow / 1000)}s${msg.treeInfo?.treeHint ? ` hint="${msg.treeInfo.treeHint}"` : ''}`);
      const next = applySetSpawnTimer(session.worldStates, msg.worldId, msg.msFromNow, now, msg.treeInfo);
      updateWorldState(session, msg.worldId, next[msg.worldId]);
      break;
    }

    case 'setTreeInfo': {
      console.log(`[mutation] ${session.code} W${msg.worldId} setTreeInfo ${msg.info.treeType}${msg.info.treeHealth ? ` ${msg.info.treeHealth}%` : ''}`);
      const next = applySetTreeInfo(session.worldStates, msg.worldId, msg.info, now);
      updateWorldState(session, msg.worldId, next[msg.worldId]);
      break;
    }

    case 'updateTreeFields': {
      const fields = Object.keys(msg.fields).join(', ');
      console.log(`[mutation] ${session.code} W${msg.worldId} updateTreeFields [${fields}]`);
      const next = applyUpdateTreeFields(session.worldStates, msg.worldId, msg.fields);
      if (next !== session.worldStates) {
        updateWorldState(session, msg.worldId, next[msg.worldId]);
      }
      break;
    }

    case 'updateHealth': {
      console.log(`[mutation] ${session.code} W${msg.worldId} updateHealth ${msg.health ?? 'clear'}`);
      const next = applyUpdateHealth(session.worldStates, msg.worldId, msg.health);
      if (next !== session.worldStates) {
        updateWorldState(session, msg.worldId, next[msg.worldId]);
      }
      break;
    }

    case 'markDead': {
      console.log(`[mutation] ${session.code} W${msg.worldId} markDead`);
      const next = applyMarkDead(session.worldStates, msg.worldId, now);
      updateWorldState(session, msg.worldId, next[msg.worldId]);
      break;
    }

    case 'clearWorld': {
      console.log(`[mutation] ${session.code} W${msg.worldId} clearWorld`);
      updateWorldState(session, msg.worldId, null);
      break;
    }
  }

  // Send ACK if the client included a msgId
  if (msg.type !== 'ping' && msg.msgId !== undefined && ws.readyState === 1) {
    const ack: ServerMessage = { type: 'ack', msgId: msg.msgId };
    ws.send(JSON.stringify(ack));
  }
}

// --- Periodic cleanup ---

setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);

// --- Start ---

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
