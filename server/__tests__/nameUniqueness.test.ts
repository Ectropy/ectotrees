import { describe, it, expect } from 'vitest';
import { isNameTaken } from '../session.ts';
import type { Session, Member } from '../session.ts';

function fakeMember(over: Partial<Member> = {}): Member {
  return {
    name: 'Alice',
    identityToken: 'AAAAAAAAAAAA',
    role: 'scout',
    banned: false,
    connections: new Set(),
    currentWorld: null,
    lastSeen: 3_000,
    ...over,
  };
}

function fakeSession(members: Member[]): Session {
  return {
    code: 'ABCDEF',
    createdAt: 1_000,
    lastActivityAt: 2_000,
    emptySince: null,
    worldStates: {},
    clients: new Set(),
    clientIds: new Map(),
    clientTypes: new Map(),
    nextClientId: 1,
    members: new Map(members.map(m => [m.identityToken, m])),
    wsToIdentityToken: new Map(),
    transitionTimer: undefined as unknown as ReturnType<typeof setInterval>,
  };
}

describe('isNameTaken', () => {
  it('rejects case-insensitive collisions', () => {
    const session = fakeSession([fakeMember({ name: 'Bob' })]);
    expect(isNameTaken(session, 'Bob')).toBe(true);
    expect(isNameTaken(session, 'bob')).toBe(true);
    expect(isNameTaken(session, 'BOB')).toBe(true);
    expect(isNameTaken(session, 'Bobby')).toBe(false);
  });

  it('ignores banned members', () => {
    const session = fakeSession([fakeMember({ name: 'Bob', banned: true })]);
    expect(isNameTaken(session, 'bob')).toBe(false);
  });

  it('excludes the member being renamed so they can re-case their own name', () => {
    const bob = fakeMember({ name: 'Bob' });
    const carol = fakeMember({ name: 'Carol', identityToken: 'CCCCCCCCCCCC' });
    const session = fakeSession([bob, carol]);
    expect(isNameTaken(session, 'BOB', bob)).toBe(false);
    expect(isNameTaken(session, 'carol', bob)).toBe(true);
  });

  it('handles sessions without a members map', () => {
    const session = fakeSession([]);
    (session as { members?: unknown }).members = undefined;
    expect(isNameTaken(session, 'anyone')).toBe(false);
  });
});
