/**
 * Plain TypeScript port of src/hooks/useSession.ts.
 * No React dependencies — uses a simple event-emitter pattern.
 */

import type { WorldStates, WorldState } from '@shared/types';
import type { ClientMessage, ServerMessage } from '@shared/protocol';

export type SessionStatus = 'disconnected' | 'connecting' | 'connected';

const API_BASE: string = process.env.API_BASE ?? '/api';
const WS_BASE: string = process.env.WS_BASE ?? '';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30_000;
const PING_ACK_TIMEOUT_MS = 8_000;
const MAX_RECONNECT_ATTEMPTS = 10;
const ACK_TIMEOUT_MS = 5_000;
const SESSION_CODE_KEY = 'evilTree_sessionCode';
const FATAL_ERRORS = new Set(['Session is full.', 'Session not found.']);

interface PendingMutation {
  msg: ClientMessage;
  timer: ReturnType<typeof setTimeout> | null;
}

type EventMap = {
  statusChange: [status: SessionStatus];
  codeChange: [code: string | null];
  clientCount: [count: number];
  error: [message: string | null];
  snapshot: [worlds: WorldStates];
  worldUpdate: [worldId: number, state: WorldState | null];
  ack: [msgId: number];
};

type EventKey = keyof EventMap;
type Listener<K extends EventKey> = (...args: EventMap[K]) => void;

// ---------------------------------------------------------------------------

export class EctoSession {
  // Public readable state
  status: SessionStatus = 'disconnected';
  code: string | null = null;
  clientCount = 0;
  error: string | null = null;
  reconnectAttempt = 0;
  reconnectAt: number | null = null;

  // Private internals
  private ws: WebSocket | null = null;
  private intentionalClose = false;
  private lastServerError: string | null = null;
  private snapshotReceived = false;
  private initialStates: WorldStates | null = null;
  private joinMergeStates: WorldStates | null = null;
  private pendingSnapshot: WorldStates | null = null;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingAckTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private msgIdCounter = 1;
  private pendingMutations = new Map<number, PendingMutation>();

  // Event listeners
  private listeners = new Map<EventKey, Set<Listener<EventKey>>>();

  constructor() {
    this.code = this.loadCode();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Register a listener for an event. Returns an unsubscribe function. */
  on<K extends EventKey>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event) as Set<Listener<K>> | undefined;
    if (!set) {
      set = new Set();
      this.listeners.set(event, set as Set<Listener<EventKey>>);
    }
    set.add(listener);
    return () => (set as Set<Listener<K>>).delete(listener);
  }

  async createSession(initialStates?: WorldStates): Promise<string | null> {
    this.setError(null);
    try {
      const res = await fetch(`${API_BASE}/session`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        this.setError(data.error ?? 'Failed to create session.');
        return null;
      }
      const code = data.code as string;
      this.code = code;
      this.saveCode(code);
      this.initialStates = initialStates ?? null;
      this.clearPending();
      this.reconnectAttempt = 0;
      this.emit('codeChange', code);
      this.connectWs(code);
      return code;
    } catch {
      this.setError('Network error creating session.');
      return null;
    }
  }

  async joinSession(code: string, localStates?: WorldStates): Promise<boolean> {
    this.setError(null);
    try {
      const res = await fetch(`${API_BASE}/session/${code}`);
      if (!res.ok) {
        const data = await res.json();
        this.setError(data.error ?? 'Session not found.');
        return false;
      }
    } catch {
      this.setError('Network error joining session.');
      return false;
    }
    this.joinMergeStates = localStates ?? null;
    this.code = code;
    this.saveCode(code);
    this.clearPending();
    this.reconnectAttempt = 0;
    this.emit('codeChange', code);
    this.connectWs(code);
    return true;
  }

  async rejoinSession(code: string): Promise<boolean> {
    this.reconnectAttempt = 0;
    this.clearPending();
    return this.joinSession(code);
  }

  leaveSession(): void {
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close(1000, 'intentionally disconnected');
      this.ws = null;
    }
    this.cleanup();
    this.code = null;
    this.saveCode(null);
    this.reconnectAttempt = 0;
    this.clearPending();
    this.setStatus('disconnected');
    this.emit('codeChange', null);
    this.clientCount = 0;
    this.emit('clientCount', 0);
  }

  sendMutation(msg: ClientMessage): void {
    const ws = this.ws;
    const id = this.msgIdCounter++;
    const msgWithId = { ...msg, msgId: id };

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msgWithId));
      const timer = setTimeout(() => {
        if (this.ws === ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, ACK_TIMEOUT_MS);
      this.pendingMutations.set(id, { msg, timer });
    } else {
      // Queue for replay on reconnect
      this.pendingMutations.set(id, { msg, timer: null });
    }
  }

  dismissError(): void {
    this.setError(null);
  }

  /** Auto-resume a previously active session on startup (mirrors useEffect on mount). */
  resume(): void {
    if (this.code && this.status === 'disconnected') {
      this.connectWs(this.code);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private emit<K extends EventKey>(event: K, ...args: EventMap[K]): void {
    const set = this.listeners.get(event) as Set<Listener<K>> | undefined;
    if (set) {
      for (const listener of set) {
        listener(...args);
      }
    }
  }

  private setStatus(s: SessionStatus): void {
    if (this.status !== s) {
      this.status = s;
      this.emit('statusChange', s);
    }
  }

  private setError(msg: string | null): void {
    this.error = msg;
    this.emit('error', msg);
  }

  private loadCode(): string | null {
    try {
      const raw = localStorage.getItem(SESSION_CODE_KEY);
      if (!raw) return null;
      const code = raw.trim().toUpperCase();
      return /^[A-Z2-9]{6}$/.test(code) ? code : null;
    } catch {
      return null;
    }
  }

  private saveCode(code: string | null): void {
    try {
      if (code) {
        localStorage.setItem(SESSION_CODE_KEY, code);
      } else {
        localStorage.removeItem(SESSION_CODE_KEY);
      }
    } catch { /* ignore */ }
  }

  private clearPendingTimers(): void {
    for (const entry of this.pendingMutations.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
  }

  private clearPending(): void {
    this.clearPendingTimers();
    this.pendingMutations = new Map();
  }

  private cleanup(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.pingAckTimer) { clearTimeout(this.pingAckTimer); this.pingAckTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.clearPendingTimers();
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  private replayPendingMutations(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const old = this.pendingMutations;
    this.pendingMutations = new Map();
    for (const entry of old.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      const newId = this.msgIdCounter++;
      const msgWithId = { ...entry.msg, msgId: newId };
      const timer = setTimeout(() => {
        if (this.ws === ws && ws.readyState === WebSocket.OPEN) ws.close();
      }, ACK_TIMEOUT_MS);
      this.pendingMutations.set(newId, { msg: entry.msg, timer });
      ws.send(JSON.stringify(msgWithId));
    }
  }

  private connectWs(code: string): void {
    this.intentionalClose = true;
    this.cleanup();
    this.intentionalClose = false;

    this.snapshotReceived = false;
    this.setStatus('connecting');
    this.setError(null);

    const ws = new WebSocket(`${WS_BASE}/ws?code=${code}`);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempt = 0;
      this.lastServerError = null;
      this.reconnectAt = null;
      this.setStatus('connected');

      if (this.initialStates) {
        ws.send(JSON.stringify({ type: 'initializeState', worlds: this.initialStates }));
        this.initialStates = null;
      }

      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
          if (this.pingAckTimer) clearTimeout(this.pingAckTimer);
          this.pingAckTimer = setTimeout(() => {
            this.pingAckTimer = null;
            if (this.ws === ws && ws.readyState === WebSocket.OPEN) ws.close();
          }, PING_ACK_TIMEOUT_MS);
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      let msg: ServerMessage;
      try { msg = JSON.parse(event.data as string); }
      catch { return; }

      switch (msg.type) {
        case 'snapshot': {
          let worlds: WorldStates;
          let toContribute: WorldStates | null = null;

          if (this.initialStates) {
            worlds = { ...msg.worlds, ...this.initialStates };
            this.initialStates = null;
          } else if (this.joinMergeStates) {
            const local = this.joinMergeStates;
            this.joinMergeStates = null;
            worlds = { ...local, ...msg.worlds };
            const localOnly = Object.fromEntries(
              Object.entries(local).filter(
                ([id, s]) =>
                  (s.treeStatus !== 'none' || s.nextSpawnTarget !== undefined) &&
                  !(Number(id) in msg.worlds)
              )
            ) as WorldStates;
            if (Object.keys(localOnly).length > 0) toContribute = localOnly;
          } else {
            worlds = msg.worlds;
          }

          this.emit('snapshot', worlds);
          this.snapshotReceived = true;
          this.replayPendingMutations();
          if (toContribute) {
            this.sendMutation({ type: 'contributeWorlds', worlds: toContribute });
          }
          break;
        }
        case 'worldUpdate':
          this.emit('worldUpdate', msg.worldId, msg.state);
          break;
        case 'clientCount':
          this.clientCount = msg.count;
          this.emit('clientCount', msg.count);
          break;
        case 'pong':
          if (this.pingAckTimer) { clearTimeout(this.pingAckTimer); this.pingAckTimer = null; }
          break;
        case 'ack': {
          const entry = this.pendingMutations.get(msg.msgId);
          if (entry) {
            if (entry.timer) clearTimeout(entry.timer);
            this.pendingMutations.delete(msg.msgId);
          }
          this.emit('ack', msg.msgId);
          break;
        }
        case 'error':
          this.lastServerError = msg.message;
          this.setError(msg.message);
          break;
        case 'sessionClosed':
          this.intentionalClose = true;
          this.cleanup();
          this.code = null;
          this.saveCode(null);
          this.clearPending();
          this.setStatus('disconnected');
          this.emit('codeChange', null);
          this.setError(msg.reason);
          break;
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;

      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      if (this.pingAckTimer) { clearTimeout(this.pingAckTimer); this.pingAckTimer = null; }
      // Pause ACK timers — will replay on reconnect
      for (const entry of this.pendingMutations.values()) {
        if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
      }

      if (this.intentionalClose) { this.intentionalClose = false; return; }

      // Fatal server rejection → give up
      if (this.lastServerError && FATAL_ERRORS.has(this.lastServerError)) {
        const msg = this.lastServerError;
        this.code = null;
        this.saveCode(null);
        this.clearPending();
        this.setStatus('disconnected');
        this.emit('codeChange', null);
        this.setError(msg);
        return;
      }

      const attempt = this.reconnectAttempt;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        this.clearPending();
        this.setStatus('disconnected');
        this.setError('Unable to reconnect.');
        this.reconnectAt = null;
        return;
      }

      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      this.reconnectAttempt = attempt + 1;
      this.reconnectAt = Date.now() + delay;
      this.setStatus('connecting');

      this.reconnectTimer = setTimeout(() => {
        this.reconnectAt = null;
        if (this.code) this.connectWs(this.code);
      }, delay);
    };

    ws.onerror = () => { /* onclose fires after */ };
  }
}
