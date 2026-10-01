import { describe, it, expect } from 'vitest';
import {
  ALL_WORLDS,
  LEAGUES_WINDOW,
  parseLeaguesWindow,
  isLeaguesActive,
  activeWorlds,
  worldList,
  isActiveWorldId,
  msUntilNextLeaguesBoundary,
} from '../worlds.ts';

const WINDOW = { start: 1_000, end: 2_000 };
const MAIN_W = ALL_WORLDS.find(w => !w.leagues)!.id;
const LEAGUES_W = ALL_WORLDS.find(w => w.leagues)!.id;
const LEAGUES_COUNT = ALL_WORLDS.filter(w => w.leagues).length;

describe('parseLeaguesWindow', () => {
  it('parses ISO start/end into ms timestamps', () => {
    expect(parseLeaguesWindow({ start: '2026-08-10T00:00:00Z', end: '2026-09-16T00:00:00Z' })).toEqual({
      start: Date.UTC(2026, 7, 10),
      end: Date.UTC(2026, 8, 16),
    });
  });

  it('treats a missing window as null', () => {
    expect(parseLeaguesWindow(undefined)).toBeNull();
    expect(parseLeaguesWindow(null)).toBeNull();
  });

  it('treats a malformed window as null', () => {
    expect(parseLeaguesWindow({ start: '2026-08-10T00:00:00Z' })).toBeNull();
    expect(parseLeaguesWindow({ start: 'soon', end: 'later' })).toBeNull();
    expect(parseLeaguesWindow({ start: 1, end: 2 })).toBeNull();
  });

  it('treats an empty or inverted window as null', () => {
    expect(parseLeaguesWindow({ start: '2026-09-16T00:00:00Z', end: '2026-08-10T00:00:00Z' })).toBeNull();
    expect(parseLeaguesWindow({ start: '2026-08-10T00:00:00Z', end: '2026-08-10T00:00:00Z' })).toBeNull();
  });
});

describe('isLeaguesActive', () => {
  it('is false just before start', () => {
    expect(isLeaguesActive(WINDOW.start - 1, WINDOW)).toBe(false);
  });

  it('is true at start (inclusive)', () => {
    expect(isLeaguesActive(WINDOW.start, WINDOW)).toBe(true);
  });

  it('is true just before end', () => {
    expect(isLeaguesActive(WINDOW.end - 1, WINDOW)).toBe(true);
  });

  it('is false at end (exclusive)', () => {
    expect(isLeaguesActive(WINDOW.end, WINDOW)).toBe(false);
  });

  it('is always false without a window', () => {
    expect(isLeaguesActive(WINDOW.start, null)).toBe(false);
  });
});

describe('msUntilNextLeaguesBoundary', () => {
  it('counts down to start before the window', () => {
    expect(msUntilNextLeaguesBoundary(WINDOW.start - 250, WINDOW)).toBe(250);
  });

  it('counts down to end inside the window', () => {
    expect(msUntilNextLeaguesBoundary(WINDOW.start, WINDOW)).toBe(WINDOW.end - WINDOW.start);
  });

  it('is null once the window has closed', () => {
    expect(msUntilNextLeaguesBoundary(WINDOW.end, WINDOW)).toBeNull();
  });

  it('is null without a window', () => {
    expect(msUntilNextLeaguesBoundary(0, null)).toBeNull();
  });
});

describe('worldList', () => {
  it('includes Leagues worlds when active', () => {
    expect(worldList(true)).toBe(ALL_WORLDS);
  });

  it('drops only the Leagues worlds when inactive', () => {
    const worlds = worldList(false);
    expect(worlds).toHaveLength(ALL_WORLDS.length - LEAGUES_COUNT);
    expect(worlds.some(w => w.leagues)).toBe(false);
  });

  it('returns a stable array per state', () => {
    expect(worldList(false)).toBe(worldList(false));
  });
});

// These run against the real worlds.json window, so they keep working when the
// dates are moved for the next event.
describe('configured window', () => {
  const window = LEAGUES_WINDOW!;

  it('is present and valid in worlds.json', () => {
    expect(LEAGUES_WINDOW).not.toBeNull();
  });

  it('has Leagues worlds to gate', () => {
    expect(LEAGUES_COUNT).toBeGreaterThan(0);
  });

  it('exposes Leagues worlds inside the window', () => {
    expect(activeWorlds(window.start)).toBe(ALL_WORLDS);
    expect(isActiveWorldId(LEAGUES_W, window.start)).toBe(true);
    expect(isActiveWorldId(MAIN_W, window.start)).toBe(true);
  });

  it('hides Leagues worlds outside the window', () => {
    expect(activeWorlds(window.end).some(w => w.leagues)).toBe(false);
    expect(isActiveWorldId(LEAGUES_W, window.end)).toBe(false);
    expect(isActiveWorldId(LEAGUES_W, window.start - 1)).toBe(false);
    expect(isActiveWorldId(MAIN_W, window.end)).toBe(true);
  });

  it('rejects unknown world IDs either way', () => {
    expect(isActiveWorldId(99999, window.start)).toBe(false);
    expect(isActiveWorldId(99999, window.end)).toBe(false);
  });
});
