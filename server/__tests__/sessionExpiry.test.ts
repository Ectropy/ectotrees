import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sessionLifespanMs,
  inactivityTtlMs,
  cleanupExpiredSessions,
  restoreSessions,
  getSession,
} from '../session.ts';
import type { PersistedStateV1, PersistedSessionV1 } from '../persistence.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ─────────────────────────────────────────────────────────────────────────────
// sessionLifespanMs — the usage-earned lifespan curve
// ─────────────────────────────────────────────────────────────────────────────

describe('sessionLifespanMs', () => {
  it('starts at the 24h base with no usage', () => {
    expect(sessionLifespanMs(0, false)).toBe(24 * HOUR);
  });

  it('fast phase: +24h per update for the first 10 updates', () => {
    expect(sessionLifespanMs(1, false)).toBe(48 * HOUR);
    expect(sessionLifespanMs(10, false)).toBe(11 * DAY);
  });

  it('mid phase: +12h per update from 11 to 168 updates, reaching 90 days', () => {
    expect(sessionLifespanMs(11, false)).toBe(11 * DAY + 12 * HOUR);
    expect(sessionLifespanMs(40, false)).toBe(26 * DAY);
    expect(sessionLifespanMs(168, false)).toBe(90 * DAY);
  });

  it('slow phase: +2h per update beyond 168 updates', () => {
    expect(sessionLifespanMs(192, false)).toBe(92 * DAY);
  });

  it('caps at 180 days', () => {
    expect(sessionLifespanMs(1248, false)).toBe(180 * DAY);
    expect(sessionLifespanMs(1_000_000, false)).toBe(180 * DAY);
  });

  it('managed sessions never drop below the 30-day floor', () => {
    expect(sessionLifespanMs(0, true)).toBe(30 * DAY);
    expect(sessionLifespanMs(10, true)).toBe(30 * DAY); // curve at 11d, floor wins
  });

  it('managed sessions follow the curve once it exceeds the floor', () => {
    expect(sessionLifespanMs(100, true)).toBe(56 * DAY);
    expect(sessionLifespanMs(100, true)).toBe(sessionLifespanMs(100, false));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inactivityTtlMs — never stricter than the historical 10-day window
// ─────────────────────────────────────────────────────────────────────────────

describe('inactivityTtlMs', () => {
  it('floors at 10 days for barely-used anonymous sessions', () => {
    expect(inactivityTtlMs(0, false)).toBe(10 * DAY);
    expect(inactivityTtlMs(5, false)).toBe(10 * DAY); // lifespan 6d < 10d floor
  });

  it('follows the earned lifespan once it exceeds 10 days', () => {
    expect(inactivityTtlMs(10, false)).toBe(11 * DAY);
    expect(inactivityTtlMs(168, false)).toBe(90 * DAY);
  });

  it('uses the 30-day managed floor', () => {
    expect(inactivityTtlMs(0, true)).toBe(30 * DAY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cleanupExpiredSessions — sessions injected via restoreSessions, time driven
// by vi.setSystemTime (not advanceTimersByTime, so restored transition timers
// never actually fire while we jump days ahead).
// ─────────────────────────────────────────────────────────────────────────────

describe('cleanupExpiredSessions', () => {
  let t0: number;

  beforeEach(() => {
    vi.useFakeTimers();
    t0 = Date.now();
  });

  afterEach(() => {
    // Drain the module-level session map so tests don't leak into each other:
    // 400 days exceeds every possible TTL (180-day cap).
    vi.setSystemTime(t0 + 400 * DAY);
    cleanupExpiredSessions();
    vi.useRealTimers();
  });

  function inject(over: Partial<PersistedSessionV1> & { code: string }) {
    const state: PersistedStateV1 = {
      version: 1,
      savedAt: Date.now(),
      sessions: [{
        createdAt: Date.now() - 60_000,
        lastActivityAt: Date.now(),
        worldStates: {},
        members: [],
        ...over,
      }],
    };
    expect(restoreSessions(state).sessions).toBe(1);
    // restoreSessions starts the empty-since clock at the current fake time
    expect(getSession(over.code)!.emptySince).toBe(Date.now());
  }

  it('destroys an unused session empty for more than 24 hours', () => {
    inject({ code: 'EXPAAA' });
    vi.setSystemTime(t0 + 23 * HOUR);
    cleanupExpiredSessions();
    expect(getSession('EXPAAA')).toBeDefined();

    vi.setSystemTime(t0 + 25 * HOUR);
    cleanupExpiredSessions();
    expect(getSession('EXPAAA')).toBeUndefined();
  });

  it('a single update earns a 48-hour empty TTL', () => {
    inject({ code: 'EXPBBB', mutationCount: 1 });
    vi.setSystemTime(t0 + 25 * HOUR);
    cleanupExpiredSessions();
    expect(getSession('EXPBBB')).toBeDefined();

    vi.setSystemTime(t0 + 49 * HOUR);
    cleanupExpiredSessions();
    expect(getSession('EXPBBB')).toBeUndefined();
  });

  it('an unused managed session survives 29 days empty but not 31', () => {
    inject({ code: 'EXPCCC', managed: true, ownerToken: 'GGGGGGGGGGGG' });
    vi.setSystemTime(t0 + 29 * DAY);
    cleanupExpiredSessions();
    expect(getSession('EXPCCC')).toBeDefined();

    vi.setSystemTime(t0 + 31 * DAY);
    cleanupExpiredSessions();
    expect(getSession('EXPCCC')).toBeUndefined();
  });

  it('expires via the inactivity branch past the 10-day floor', () => {
    // Restored sessions are always empty, so the (also scaled) empty TTL
    // dominates in practice; give this session enough usage that its 16-day
    // empty TTL outlives the 10-day inactivity floor... except inactivityTtl
    // is max(10d, lifespan) = 16d too. So the inactivity branch fires when
    // lastActivityAt is old enough while emptySince is fresh.
    inject({ code: 'EXPDDD', mutationCount: 20, lastActivityAt: Date.now() - 15 * DAY });
    vi.setSystemTime(t0 + 12 * HOUR);
    cleanupExpiredSessions();
    expect(getSession('EXPDDD')).toBeDefined(); // 15.5d inactive < 16d TTL, 12h empty < 16d

    vi.setSystemTime(t0 + 2 * DAY);
    cleanupExpiredSessions();
    expect(getSession('EXPDDD')).toBeUndefined(); // 17d inactive > 16d TTL
  });
});
