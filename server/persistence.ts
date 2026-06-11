import fs from 'node:fs';
import path from 'node:path';
import type { WorldStates } from '../shared/types.ts';
import type { MemberRole } from '../shared/protocol.ts';
import type { Session } from './session.ts';
import { warn } from './log.ts';

// Trailing throttle: a save is at most 1s behind the mutation that requested it,
// which bounds data loss on a hard crash to ~1s of mutations.
const SAVE_THROTTLE_MS = 1000;

// The durable slice of a Member — connections/currentWorld are rebuilt on reconnect.
export interface PersistedMemberV1 {
  name: string;
  identityToken: string;
  role: MemberRole;
  banned: boolean;
  lastSeen: number;
}

// The durable slice of a Session — clients, timers, and the in-flight fork window
// are ephemeral and rebuilt (or deliberately dropped) on restart.
export interface PersistedSessionV1 {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  worldStates: WorldStates;
  members: PersistedMemberV1[];
  managed?: boolean;
  ownerToken?: string;
  allowOpenJoin?: boolean;
  name?: string;
  description?: string;
  listed?: boolean;
  lastForkAt?: number;
}

const STATE_VERSION = 1;

export interface PersistedStateV1 {
  version: typeof STATE_VERSION;
  savedAt: number;
  sessions: PersistedSessionV1[];
}

const STATE_FILENAME = 'sessions.json';

let stateFile: string | null = null;
let getSessions: (() => Iterable<Session>) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Wire up persistence: ensure the data directory exists and is writable
 * (probe write), and register the live session provider. Throws if the
 * directory cannot be created or written to — the caller decides whether
 * that is fatal.
 */
export function initPersistence(dataDir: string, provider: () => Iterable<Session>): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const probe = path.join(dataDir, '.write-probe');
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
  stateFile = path.join(dataDir, STATE_FILENAME);
  getSessions = provider;
}

/** Extract the durable slice of every session. Pure — no I/O. */
export function serializeSessions(sessions: Iterable<Session>): PersistedStateV1 {
  const out: PersistedSessionV1[] = [];
  for (const s of sessions) {
    const members: PersistedMemberV1[] = [];
    for (const m of s.members.values()) {
      members.push({
        name: m.name,
        identityToken: m.identityToken,
        role: m.role,
        banned: m.banned,
        lastSeen: m.lastSeen,
      });
    }
    // Optional fields left as undefined are dropped by JSON.stringify
    out.push({
      code: s.code,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      worldStates: s.worldStates,
      members,
      managed: s.managed,
      ownerToken: s.ownerToken,
      allowOpenJoin: s.allowOpenJoin,
      name: s.name,
      description: s.description,
      listed: s.listed,
      lastForkAt: s.lastForkAt,
    });
  }
  return { version: STATE_VERSION, savedAt: Date.now(), sessions: out };
}

/**
 * Write the current state to disk synchronously. Sync I/O is deliberate: the
 * payload is tens of KB, and it makes the shutdown flush and overlapping-write
 * races a non-issue. Write order (tmp → rotate .bak → rename into place) means
 * a crash mid-save never corrupts the previous good file.
 */
export function saveState(): void {
  if (!stateFile || !getSessions) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    const json = JSON.stringify(serializeSessions(getSessions()));
    const tmpFile = `${stateFile}.tmp`;
    fs.writeFileSync(tmpFile, json);
    if (fs.existsSync(stateFile)) {
      fs.renameSync(stateFile, `${stateFile}.bak`);
    }
    fs.renameSync(tmpFile, stateFile);
  } catch (err) {
    warn(`[persistence] Failed to save state: ${err}`);
  }
}

/**
 * Request a save. Trailing throttle, not debounce: the first request arms a
 * timer and further requests within the window are absorbed into the pending
 * save, so a constant mutation stream can never starve the write.
 */
export function scheduleSave(): void {
  if (!stateFile || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveState();
  }, SAVE_THROTTLE_MS);
}

/**
 * Load persisted state from disk at boot.
 *
 * Recovery policy (specified by the tests in __tests__/persistence.test.ts):
 * - No state file              → null (fresh start)
 * - Corrupt state file         → fall back to the .bak from the previous save
 * - Corrupt/missing .bak too   → null (start fresh rather than refuse to boot)
 * - Unknown `version` field    → fall back to the .bak from the previous save (after a rollback it might be a compatible version)
 */
export function loadState(): PersistedStateV1 | null {
  if (!stateFile) return null;

  for (const file of [stateFile, `${stateFile}.bak`]) { //check main state file, then backup
    if (fs.existsSync(file)) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(data) as PersistedStateV1;
        if (parsed.version === STATE_VERSION) {
          return parsed;
        } else {
          warn(`[persistence] Expected version ${STATE_VERSION} but ${file} is version ${parsed.version}`);
        }
      } catch (err) {
        warn(`[persistence] Failed to parse ${file}: ${err}`);
      }
    }
  }
  return null;
}
