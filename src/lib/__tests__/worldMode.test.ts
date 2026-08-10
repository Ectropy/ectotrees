import { describe, it, expect, beforeEach } from 'vitest';
import type { WorldConfig } from '../../types';
import {
  partitionWorlds,
  worldModeFor,
  normalizeWorldMode,
  loadWorldMode,
  loadLeaguesSeen,
  WORLD_MODE_STORAGE_KEY,
  LEAGUES_SEEN_STORAGE_KEY,
} from '../worldMode';

// The vitest environment is 'node' (vite.config.ts), so there is no DOM. These
// helpers only touch getItem/setItem/clear, so a minimal stub is cheaper and more
// explicit than pulling in jsdom for three assertions.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const MAIN_P2P: WorldConfig = { id: 1, type: 'P2P' };
const MAIN_F2P: WorldConfig = { id: 3, type: 'F2P' };
const LEAGUES_P2P: WorldConfig = { id: 233, type: 'P2P', leagues: true };
const LEAGUES_F2P: WorldConfig = { id: 234, type: 'F2P', leagues: true };

describe('partitionWorlds', () => {
  it('splits worlds by the leagues flag', () => {
    const { main, leagues } = partitionWorlds([MAIN_P2P, LEAGUES_P2P, MAIN_F2P, LEAGUES_F2P]);
    expect(main).toEqual([MAIN_P2P, MAIN_F2P]);
    expect(leagues).toEqual([LEAGUES_P2P, LEAGUES_F2P]);
  });

  it('preserves source ordering within each set', () => {
    const { main } = partitionWorlds([MAIN_F2P, LEAGUES_P2P, MAIN_P2P]);
    expect(main.map(w => w.id)).toEqual([3, 1]);
  });

  it('treats a missing leagues flag as main', () => {
    const { main, leagues } = partitionWorlds([MAIN_P2P]);
    expect(main).toHaveLength(1);
    expect(leagues).toHaveLength(0);
  });

  it('treats leagues:false as main', () => {
    const { main, leagues } = partitionWorlds([{ id: 5, type: 'P2P', leagues: false }]);
    expect(main).toHaveLength(1);
    expect(leagues).toHaveLength(0);
  });

  it('returns empty sets for an empty list', () => {
    expect(partitionWorlds([])).toEqual({ main: [], leagues: [] });
  });

  // Leagues is orthogonal to membership type — this is the invariant the whole
  // mode-switcher design rests on, so guard it explicitly.
  it('keeps both P2P and F2P worlds within the leagues set', () => {
    const { leagues } = partitionWorlds([LEAGUES_P2P, LEAGUES_F2P]);
    expect(leagues.map(w => w.type)).toEqual(['P2P', 'F2P']);
  });
});

describe('worldModeFor', () => {
  it('maps a leagues world to leagues', () => {
    expect(worldModeFor(LEAGUES_F2P)).toBe('leagues');
  });

  it('maps a plain world to main', () => {
    expect(worldModeFor(MAIN_P2P)).toBe('main');
  });
});

describe('normalizeWorldMode', () => {
  it('accepts leagues', () => {
    expect(normalizeWorldMode('leagues')).toBe('leagues');
  });

  it.each([['main'], ['LEAGUES'], [''], ['nonsense'], [null], [undefined], [42], [{}]])(
    'falls back to main for %p',
    (value) => {
      expect(normalizeWorldMode(value)).toBe('main');
    },
  );
});

describe('loadWorldMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads a stored leagues preference', () => {
    localStorage.setItem(WORLD_MODE_STORAGE_KEY, 'leagues');
    expect(loadWorldMode(true)).toBe('leagues');
  });

  it('defaults to main when nothing is stored', () => {
    expect(loadWorldMode(true)).toBe('main');
  });

  it('ignores a garbage stored value', () => {
    localStorage.setItem(WORLD_MODE_STORAGE_KEY, 'not-a-mode');
    expect(loadWorldMode(true)).toBe('main');
  });

  // Guards the post-event case: Leagues entries get deleted from worlds.json, but a
  // stored 'leagues' would otherwise strand the user on a permanently empty grid.
  it('forces main when no leagues worlds are configured', () => {
    localStorage.setItem(WORLD_MODE_STORAGE_KEY, 'leagues');
    expect(loadWorldMode(false)).toBe('main');
  });
});

describe('loadLeaguesSeen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is false before the user has opened Leagues', () => {
    expect(loadLeaguesSeen()).toBe(false);
  });

  it('is true once the flag is set', () => {
    localStorage.setItem(LEAGUES_SEEN_STORAGE_KEY, '1');
    expect(loadLeaguesSeen()).toBe(true);
  });

  it('is false for any other stored value', () => {
    localStorage.setItem(LEAGUES_SEEN_STORAGE_KEY, '0');
    expect(loadLeaguesSeen()).toBe(false);
  });
});
