import { describe, it, expect } from 'vitest';
import type { WebSocket } from 'ws';
import type { WorldStates } from '../../shared/types.ts';
import { buildSessionInfo, getListedSessions, restoreSessions } from '../session.ts';
import type { Session, Member } from '../session.ts';

// Fake WebSocket — buildSessionInfo only uses these as Set members / Map keys.
function fakeWs(): WebSocket {
  return {} as unknown as WebSocket;
}

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

function fakeSession(over: Partial<Session> = {}): Session {
  return {
    code: 'ABCDEF',
    createdAt: 1_000,
    lastActivityAt: 2_000,
    emptySince: null,
    mutationCount: 0,
    worldStates: {},
    clients: new Set(),
    clientIds: new Map(),
    clientTypes: new Map(),
    nextClientId: 1,
    members: new Map(),
    wsToIdentityToken: new Map(),
    transitionTimer: undefined as unknown as ReturnType<typeof setInterval>,
    ...over,
  };
}

describe('buildSessionInfo', () => {
  it('(a) managed: excludes banned members, dedupes per-member scout/dashboard, counts anonymous ws by type', () => {
    // Member with BOTH a scout and dashboard connection — counts once in each.
    const dualWs1 = fakeWs();
    const dualWs2 = fakeWs();
    const dual = fakeMember({
      name: 'Dual', identityToken: 'DUALDUALDUAL',
      connections: new Set([dualWs1, dualWs2]),
    });
    // Banned member — excluded from memberCount and role counts.
    const troll = fakeMember({ name: 'Troll', identityToken: 'TROLLTROLLTR', banned: true });
    // Anonymous ws (not in wsToIdentityToken) counted by its clientType.
    const anonWs = fakeWs();

    const clientTypes = new Map<WebSocket, 'scout' | 'dashboard' | 'unknown'>([
      [dualWs1, 'scout'],
      [dualWs2, 'dashboard'],
      [anonWs, 'dashboard'],
    ]);

    const session = fakeSession({
      managed: true,
      members: new Map([
        [dual.identityToken, dual],
        [troll.identityToken, troll],
      ]),
      clients: new Set([dualWs1, dualWs2, anonWs]),
      clientTypes,
      wsToIdentityToken: new Map([
        [dualWs1, dual.identityToken],
        [dualWs2, dual.identityToken],
      ]),
    });

    const info = buildSessionInfo(session);
    expect(info.memberCount).toBe(1);      // banned excluded
    expect(info.scouts).toBe(1);           // dual member's scout conn (once) — no anon scout
    expect(info.dashboards).toBe(2);       // dual member (once) + anonymous dashboard ws
    expect(info.clientCount).toBe(3);
  });

  it('(b) anonymous session with no members map does not throw; memberCount === clients.size', () => {
    const w1 = fakeWs();
    const w2 = fakeWs();
    const session = fakeSession({
      managed: false,
      members: undefined as unknown as Map<string, Member>,
      clients: new Set([w1, w2]),
      clientTypes: new Map([[w1, 'scout'], [w2, 'dashboard']]),
      wsToIdentityToken: undefined as unknown as Map<WebSocket, string>,
    });

    let info: ReturnType<typeof buildSessionInfo>;
    expect(() => { info = buildSessionInfo(session); }).not.toThrow();
    expect(info!.memberCount).toBe(2);
    expect(info!.clientCount).toBe(2);
    expect(info!.scouts).toBe(1);
    expect(info!.dashboards).toBe(1);
  });

  it('(c) activeWorldCount counts only worlds with a tree or a pending spawn', () => {
    const worldStates: WorldStates = {
      1: { treeStatus: 'mature', treeType: 'oak', matureAt: 1, treeSetAt: 1 },
      2: { treeStatus: 'none', nextSpawnTarget: 9_999, spawnSetAt: 1 },
      3: { treeStatus: 'none' },                       // inactive — not counted
    };
    const info = buildSessionInfo(fakeSession({ worldStates }));
    expect(info.activeWorldCount).toBe(2);
  });
});

describe('getListedSessions', () => {
  it('(d) returns only managed + listed + named sessions, each with a string name', () => {
    const now = Date.now();
    restoreSessions({
      version: 1,
      savedAt: now,
      sessions: [
        { code: 'LISTED', createdAt: now, lastActivityAt: now, worldStates: {}, members: [],
          managed: true, listed: true, name: 'Public One' },
        { code: 'NOLIST', createdAt: now, lastActivityAt: now, worldStates: {}, members: [],
          managed: true, listed: false, name: 'Private One' },
        { code: 'NONAME', createdAt: now, lastActivityAt: now, worldStates: {}, members: [],
          managed: true, listed: true },
      ],
    });

    const listed = getListedSessions();
    const codes = listed.map(s => s.code);
    expect(codes).toContain('LISTED');
    expect(codes).not.toContain('NOLIST');
    expect(codes).not.toContain('NONAME');
    for (const s of listed) {
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
});
