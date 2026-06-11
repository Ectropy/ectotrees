import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WorldStates } from '../../shared/types.ts';
import {
  initPersistence,
  serializeSessions,
  saveState,
  scheduleSave,
  loadState,
  type PersistedStateV1,
} from '../persistence.ts';
import { restoreSessions, getSession, authenticateByIdentityToken } from '../session.ts';
import type { Session, Member } from '../session.ts';

const WORLDS: WorldStates = {
  5: { treeStatus: 'mature', treeType: 'oak', treeHint: 'Varrock', matureAt: 1_111, treeSetAt: 1_000 },
  86: { treeStatus: 'none', nextSpawnTarget: 9_999, spawnSetAt: 8_888 },
};

function fakeMember(over: Partial<Member> = {}): Member {
  return {
    name: 'Alice',
    identityToken: 'AAAAAAAAAAAA',
    role: 'scout',
    banned: false,
    connections: new Set(),
    currentWorld: 5,
    lastSeen: 3_000,
    ...over,
  };
}

function fakeSession(over: Partial<Session> = {}): Session {
  return {
    code: 'ABCDEF',
    createdAt: 1_000,
    lastActivityAt: 2_000,
    emptySince: null,
    worldStates: WORLDS,
    clients: new Set(),
    clientIds: new Map(),
    clientTypes: new Map(),
    nextClientId: 7,
    members: new Map(),
    wsToIdentityToken: new Map(),
    transitionTimer: undefined as unknown as ReturnType<typeof setInterval>,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// serializeSessions
// ─────────────────────────────────────────────────────────────────────────────

describe('serializeSessions', () => {
  it('round-trips durable fields through JSON and drops ephemeral ones', () => {
    const owner = fakeMember({ name: 'Owner', identityToken: 'BBBBBBBBBBBB', role: 'owner' });
    const banned = fakeMember({ name: 'Troll', identityToken: 'CCCCCCCCCCCC', banned: true });
    const session = fakeSession({
      managed: true,
      ownerToken: owner.identityToken,
      allowOpenJoin: true,
      name: "Owner's Session",
      description: 'desc',
      listed: true,
      lastForkAt: 4_000,
      members: new Map([
        [owner.identityToken, owner],
        [banned.identityToken, banned],
      ]),
    });

    const state = JSON.parse(JSON.stringify(serializeSessions([session]))) as PersistedStateV1;

    expect(state.version).toBe(1);
    expect(state.sessions).toHaveLength(1);
    const s = state.sessions[0];
    expect(s).toMatchObject({
      code: 'ABCDEF',
      createdAt: 1_000,
      lastActivityAt: 2_000,
      worldStates: WORLDS,
      managed: true,
      ownerToken: 'BBBBBBBBBBBB',
      allowOpenJoin: true,
      name: "Owner's Session",
      description: 'desc',
      listed: true,
      lastForkAt: 4_000,
    });
    expect(s.members).toEqual([
      { name: 'Owner', identityToken: 'BBBBBBBBBBBB', role: 'owner', banned: false, lastSeen: 3_000 },
      { name: 'Troll', identityToken: 'CCCCCCCCCCCC', role: 'scout', banned: true, lastSeen: 3_000 },
    ]);
    // Ephemeral state must not be persisted
    expect(s).not.toHaveProperty('clients');
    expect(s).not.toHaveProperty('transitionTimer');
    expect(s).not.toHaveProperty('pendingFork');
    expect(s.members[0]).not.toHaveProperty('connections');
    expect(s.members[0]).not.toHaveProperty('currentWorld');
  });

  it('omits undefined optional fields for anonymous sessions', () => {
    const state = JSON.parse(JSON.stringify(serializeSessions([fakeSession()]))) as PersistedStateV1;
    const s = state.sessions[0];
    expect(s).not.toHaveProperty('managed');
    expect(s).not.toHaveProperty('ownerToken');
    expect(s).not.toHaveProperty('name');
    expect(s).not.toHaveProperty('listed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// saveState / scheduleSave / loadState — real files in a temp dir
// ─────────────────────────────────────────────────────────────────────────────

describe('save and load', () => {
  let dataDir: string;
  let stateFile: string;
  let provided: Session[];

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecto-persist-'));
    stateFile = path.join(dataDir, 'sessions.json');
    provided = [fakeSession()];
    initPersistence(dataDir, () => provided);
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('saveState writes the file and rotates the previous save to .bak', () => {
    saveState();
    const first = fs.readFileSync(stateFile, 'utf8');
    expect((JSON.parse(first) as PersistedStateV1).sessions[0].code).toBe('ABCDEF');

    provided = [fakeSession({ code: 'GHJKLM' })];
    saveState();
    const second = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as PersistedStateV1;
    const backup = JSON.parse(fs.readFileSync(`${stateFile}.bak`, 'utf8')) as PersistedStateV1;
    expect(second.sessions[0].code).toBe('GHJKLM');
    expect(backup.sessions[0].code).toBe('ABCDEF');
  });

  it('scheduleSave throttles: many requests produce one deferred write', () => {
    vi.useFakeTimers();
    scheduleSave();
    scheduleSave();
    scheduleSave();
    expect(fs.existsSync(stateFile)).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(fs.existsSync(stateFile)).toBe(true);
  });

  // The tests below are the spec for the loadState recovery policy.

  it('returns the saved state when the file is valid', () => {
    saveState();
    const loaded = loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.sessions[0].code).toBe('ABCDEF');
    expect(loaded!.sessions[0].worldStates).toEqual(WORLDS);
  });

  it('returns null when no state file exists (fresh start)', () => {
    expect(loadState()).toBeNull();
  });

  it('falls back to .bak when the state file is corrupt', () => {
    saveState();
    provided = [fakeSession({ code: 'GHJKLM' })];
    saveState(); // 'ABCDEF' save is now the .bak
    fs.writeFileSync(stateFile, '{"version":1,"sessions":[{TRUNCATED');
    const loaded = loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.sessions[0].code).toBe('ABCDEF');
  });

  it('returns null when the state file is corrupt and there is no .bak', () => {
    fs.writeFileSync(stateFile, 'not json at all');
    expect(loadState()).toBeNull();
  });

  it('returns null when both the state file and .bak are corrupt', () => {
    fs.writeFileSync(stateFile, '{broken');
    fs.writeFileSync(`${stateFile}.bak`, '{also broken');
    expect(loadState()).toBeNull();
  });

  it('returns null for an unknown version (no .bak present)', () => {
    fs.writeFileSync(stateFile, JSON.stringify({ version: 99, savedAt: 1, sessions: [] }));
    expect(loadState()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// restoreSessions
// ─────────────────────────────────────────────────────────────────────────────

describe('restoreSessions', () => {
  beforeEach(() => {
    // Fake timers so restored sessions' transition intervals never really run
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function persistedSession(over: Partial<PersistedStateV1['sessions'][0]> = {}): PersistedStateV1['sessions'][0] {
    return {
      code: 'RSTRNT',
      createdAt: Date.now() - 60_000,
      lastActivityAt: Date.now() - 30_000,
      worldStates: WORLDS,
      members: [],
      ...over,
    };
  }

  it('returns zero counts for null input (fresh start)', () => {
    expect(restoreSessions(null)).toEqual({ sessions: 0, members: 0 });
  });

  it('rebuilds a full session with fresh ephemeral state', () => {
    const result = restoreSessions({
      version: 1,
      savedAt: Date.now(),
      sessions: [persistedSession({
        code: 'RSTRWX',
        managed: true,
        ownerToken: 'DDDDDDDDDDDD',
        name: 'Restored',
        listed: true,
        members: [
          { name: 'Owner', identityToken: 'DDDDDDDDDDDD', role: 'owner', banned: false, lastSeen: 5_000 },
          { name: 'Troll', identityToken: 'EEEEEEEEEEEE', role: 'scout', banned: true, lastSeen: 5_000 },
        ],
      })],
    });
    expect(result).toEqual({ sessions: 1, members: 2 });

    const session = getSession('RSTRWX')!;
    expect(session.worldStates).toEqual(WORLDS);
    expect(session.managed).toBe(true);
    expect(session.name).toBe('Restored');
    expect(session.clients.size).toBe(0);
    expect(session.nextClientId).toBe(1);
    expect(session.emptySince).toBe(Date.now()); // 24h grace window restarts now
    expect(session.members.get('DDDDDDDDDDDD')!.connections.size).toBe(0);
    expect(session.members.get('DDDDDDDDDDDD')!.currentWorld).toBeNull();

    // Active member can authenticate again; banned member's token stays revoked
    const auth = authenticateByIdentityToken('DDDDDDDDDDDD');
    expect('member' in auth && auth.member.name).toBe('Owner');
    const bannedAuth = authenticateByIdentityToken('EEEEEEEEEEEE');
    expect('error' in bannedAuth).toBe(true);
  });

  it('skips sessions already past the 10-day inactivity limit', () => {
    const result = restoreSessions({
      version: 1,
      savedAt: Date.now(),
      sessions: [persistedSession({
        code: 'RSTROL',
        lastActivityAt: Date.now() - 11 * 24 * 60 * 60 * 1000,
      })],
    });
    expect(result.sessions).toBe(0);
    expect(getSession('RSTROL')).toBeUndefined();
  });

  it('does not clobber an existing session with the same code', () => {
    const snapshot: PersistedStateV1 = { version: 1, savedAt: Date.now(), sessions: [persistedSession({ code: 'RSTRDP' })] };
    expect(restoreSessions(snapshot).sessions).toBe(1);
    expect(restoreSessions(snapshot).sessions).toBe(0);
  });
});
