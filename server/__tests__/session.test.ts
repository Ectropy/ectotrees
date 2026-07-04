import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { restoreSessions, getSession, selfRegisterMember } from '../session.ts';
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
