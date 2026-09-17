import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { restoreSessions, getSession, selfRegisterMember, requestIdentityToken, reapStaleAnonymousMembers, authenticateByIdentityToken } from '../session.ts';
import type { PersistedStateV1 } from '../persistence.ts';

// ─────────────────────────────────────────────────────────────────────────────
// selfRegisterMember — identity-token migration is limited to the fork parent
// ─────────────────────────────────────────────────────────────────────────────

describe('selfRegisterMember — token migration', () => {
  beforeEach(() => {
    // Fake timers so restored sessions' transition intervals never really run
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function persistedSession(code: string, memberToken?: string): PersistedStateV1['sessions'][0] {
    return {
      code,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      worldStates: {},
      members: memberToken
        ? [{ name: `Member-${code}`, identityToken: memberToken, role: 'scout', banned: false, lastSeen: Date.now() }]
        : [],
    };
  }

  function setupForkedChild(childCode: string, parentCode: string, srToken: string) {
    const child = getSession(childCode)!;
    child.managed = true;
    child.forkedFromCode = parentCode;
    child.selfRegisterUntil = Date.now() + 60_000;
    child.selfRegisterTokens = new Map([[srToken, false]]);
    return child;
  }

  it('migrates a token from the fork parent and removes the member there', () => {
    restoreSessions({
      version: 1,
      savedAt: Date.now(),
      sessions: [persistedSession('MGPRNT', 'DDDDDDDDDDDD'), persistedSession('MGCHLD')],
    });
    const parent = getSession('MGPRNT')!;
    const child = setupForkedChild('MGCHLD', 'MGPRNT', 'sr-token-1');

    const result = selfRegisterMember(child, 'Migrator', 'sr-token-1', 'DDDDDDDDDDDD');

    expect(result).toEqual({ identityToken: 'DDDDDDDDDDDD' });
    expect(child.members.has('DDDDDDDDDDDD')).toBe(true);
    expect(parent.members.has('DDDDDDDDDDDD')).toBe(false);
  });

  it('does not migrate a token from an unrelated session (issues a fresh one, victim untouched)', () => {
    restoreSessions({
      version: 1,
      savedAt: Date.now(),
      sessions: [persistedSession('URPRNT'), persistedSession('URVCTM', 'EEEEEEEEEEEE'), persistedSession('URCHLD')],
    });
    const victim = getSession('URVCTM')!;
    const child = setupForkedChild('URCHLD', 'URPRNT', 'sr-token-2');

    const result = selfRegisterMember(child, 'Griefer', 'sr-token-2', 'EEEEEEEEEEEE');

    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result.identityToken).not.toBe('EEEEEEEEEEEE');
    }
    expect(victim.members.has('EEEEEEEEEEEE')).toBe(true);
    expect(child.members.has('EEEEEEEEEEEE')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requestIdentityToken — bounded by MAX_MEMBERS_PER_SESSION
// ─────────────────────────────────────────────────────────────────────────────

describe('requestIdentityToken — member cap', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function anonSession(code: string, memberCount: number): PersistedStateV1['sessions'][0] {
    const members = Array.from({ length: memberCount }, (_, i) => ({
      name: 'Anonymous',
      identityToken: `T${String(i).padStart(11, '0')}`,
      role: 'scout' as const,
      banned: false,
      lastSeen: Date.now(),
    }));
    return { code, createdAt: Date.now(), lastActivityAt: Date.now(), worldStates: {}, members };
  }

  it('issues a token while under the cap', () => {
    restoreSessions({ version: 1, savedAt: Date.now(), sessions: [anonSession('CAPOK1', 499)] });
    const session = getSession('CAPOK1')!;
    const ws = {} as unknown as import('ws').WebSocket;
    const result = requestIdentityToken(session, ws);
    expect(result.type).toBe('identityToken');
    expect(session.members.size).toBe(500);
  });

  it('refuses once the session holds MAX_MEMBERS_PER_SESSION members', () => {
    restoreSessions({ version: 1, savedAt: Date.now(), sessions: [anonSession('CAPFUL', 500)] });
    const session = getSession('CAPFUL')!;
    const ws = {} as unknown as import('ws').WebSocket;
    const result = requestIdentityToken(session, ws);
    expect(result).toEqual({ type: 'error', message: 'Maximum members reached.' });
    expect(session.members.size).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reapStaleAnonymousMembers — anonymous-session tokens age out; managed never do
// ─────────────────────────────────────────────────────────────────────────────

describe('reapStaleAnonymousMembers', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const DAY = 24 * 60 * 60 * 1000;

  function withMembers(code: string, members: { token: string; lastSeen: number }[], managed = false): PersistedStateV1['sessions'][0] {
    return {
      code,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      worldStates: {},
      managed,
      members: members.map(m => ({ name: 'M', identityToken: m.token, role: 'scout' as const, banned: false, lastSeen: m.lastSeen })),
    };
  }

  it('removes unconnected anonymous members not seen for 30 days and keeps recent ones', () => {
    const now = Date.now();
    restoreSessions({
      version: 1, savedAt: now,
      sessions: [withMembers('REAP01', [
        { token: 'STALESTALE01', lastSeen: now - 31 * DAY },
        { token: 'FRESHFRESH01', lastSeen: now - 29 * DAY },
      ])],
    });
    const session = getSession('REAP01')!;
    expect(reapStaleAnonymousMembers(now)).toBe(1);
    expect(session.members.has('STALESTALE01')).toBe(false);
    expect(session.members.has('FRESHFRESH01')).toBe(true);
    expect(authenticateByIdentityToken('STALESTALE01')).toHaveProperty('error');
  });

  it('never touches managed sessions', () => {
    const now = Date.now();
    restoreSessions({
      version: 1, savedAt: now,
      sessions: [withMembers('REAPMG', [{ token: 'OWNEROWNER01', lastSeen: now - 400 * DAY }], true)],
    });
    expect(reapStaleAnonymousMembers(now)).toBe(0);
    expect(getSession('REAPMG')!.members.has('OWNEROWNER01')).toBe(true);
  });

  it('skips members that still have a live connection', () => {
    const now = Date.now();
    restoreSessions({
      version: 1, savedAt: now,
      sessions: [withMembers('REAPCN', [{ token: 'CONNECTED001', lastSeen: now - 60 * DAY }])],
    });
    const member = getSession('REAPCN')!.members.get('CONNECTED001')!;
    member.connections.add({} as unknown as import('ws').WebSocket);
    expect(reapStaleAnonymousMembers(now)).toBe(0);
  });
});
