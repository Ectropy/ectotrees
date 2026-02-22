import { describe, it, expect } from 'vitest';
import {
  applyTransitions,
  applySetSpawnTimer,
  applySetTreeInfo,
  applyUpdateTreeFields,
  applyUpdateHealth,
  applyMarkDead,
  applyClearWorld,
} from '../mutations.ts';
import { SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS } from '../types.ts';

// Baseline timestamp — arbitrary fixed point in time
const T = 1_700_000_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// applyTransitions
// ─────────────────────────────────────────────────────────────────────────────

describe('applyTransitions', () => {
  it('returns the same reference when no transitions are due', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeSetAt: T },
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS - 1);
    expect(result).toBe(states);
  });

  it('sapling → mature at the exact boundary', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeSetAt: T },
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS);
    expect(result[1].treeStatus).toBe('mature');
  });

  it('sapling stays sapling one ms before boundary', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeSetAt: T },
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS - 1);
    expect(result[1].treeStatus).toBe('sapling');
  });

  it('sapling-oak → oak on maturation', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeType: 'sapling-oak' as const, treeSetAt: T },
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS);
    expect(result[1].treeType).toBe('oak');
    expect(result[1].treeStatus).toBe('mature');
  });

  it('sapling-maple → maple on maturation', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeType: 'sapling-maple' as const, treeSetAt: T },
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS);
    expect(result[1].treeType).toBe('maple');
  });

  it('sapling-elder → elder on maturation', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeType: 'sapling-elder' as const, treeSetAt: T },
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS);
    expect(result[1].treeType).toBe('elder');
  });

  it('plain sapling → mature (no type suffix)', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeType: 'sapling' as const, treeSetAt: T },
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS);
    expect(result[1].treeType).toBe('mature');
    expect(result[1].treeStatus).toBe('mature');
  });

  it('sets matureAt to treeSetAt + SAPLING_MATURE_MS on sapling→mature', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeSetAt: T },
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS);
    expect(result[1].matureAt).toBe(T + SAPLING_MATURE_MS);
  });

  it('mature → dead at matureAt + ALIVE_DEAD_MS', () => {
    const matureAt = T;
    const states = {
      1: { treeStatus: 'mature' as const, matureAt },
    };
    const result = applyTransitions(states, matureAt + ALIVE_DEAD_MS);
    expect(result[1].treeStatus).toBe('dead');
    expect(result[1].deadAt).toBe(matureAt + ALIVE_DEAD_MS);
  });

  it('mature stays mature one ms before ALIVE_DEAD_MS', () => {
    const matureAt = T;
    const states = {
      1: { treeStatus: 'mature' as const, matureAt },
    };
    const result = applyTransitions(states, matureAt + ALIVE_DEAD_MS - 1);
    expect(result[1].treeStatus).toBe('mature');
  });

  it('alive → dead at matureAt + ALIVE_DEAD_MS', () => {
    const matureAt = T;
    const states = {
      1: { treeStatus: 'alive' as const, matureAt },
    };
    const result = applyTransitions(states, matureAt + ALIVE_DEAD_MS);
    expect(result[1].treeStatus).toBe('dead');
  });

  it('mature → dead clears treeHealth', () => {
    const matureAt = T;
    const states = {
      1: { treeStatus: 'mature' as const, matureAt, treeHealth: 60 },
    };
    const result = applyTransitions(states, matureAt + ALIVE_DEAD_MS);
    expect(result[1].treeHealth).toBeUndefined();
  });

  it('dead → none at deadAt + DEAD_CLEAR_MS', () => {
    const deadAt = T;
    const states = {
      1: { treeStatus: 'dead' as const, deadAt },
    };
    const result = applyTransitions(states, deadAt + DEAD_CLEAR_MS);
    expect(result[1].treeStatus).toBe('none');
  });

  it('dead stays dead one ms before DEAD_CLEAR_MS', () => {
    const deadAt = T;
    const states = {
      1: { treeStatus: 'dead' as const, deadAt },
    };
    const result = applyTransitions(states, deadAt + DEAD_CLEAR_MS - 1);
    expect(result[1].treeStatus).toBe('dead');
  });

  it('nextSpawnTarget fires → spawns sapling with treeType sapling', () => {
    const spawnAt = T;
    const states = {
      1: { treeStatus: 'none' as const, nextSpawnTarget: spawnAt, spawnSetAt: T - 1000 },
    };
    const result = applyTransitions(states, spawnAt);
    expect(result[1].treeStatus).toBe('sapling');
    expect(result[1].treeType).toBe('sapling');
    expect(result[1].treeSetAt).toBe(spawnAt);
    expect(result[1].nextSpawnTarget).toBeUndefined();
    expect(result[1].spawnSetAt).toBeUndefined();
  });

  it('nextSpawnTarget fires and sets matureAt = nextSpawnTarget + SAPLING_MATURE_MS', () => {
    const spawnAt = T;
    const states = {
      1: { treeStatus: 'none' as const, nextSpawnTarget: spawnAt },
    };
    const result = applyTransitions(states, spawnAt);
    expect(result[1].matureAt).toBe(spawnAt + SAPLING_MATURE_MS);
  });

  it('only changes worlds that are due, leaves others untouched', () => {
    const states = {
      1: { treeStatus: 'sapling' as const, treeSetAt: T },        // due
      2: { treeStatus: 'sapling' as const, treeSetAt: T + 5000 }, // not yet due
    };
    const result = applyTransitions(states, T + SAPLING_MATURE_MS);
    expect(result[1].treeStatus).toBe('mature');
    expect(result[2].treeStatus).toBe('sapling');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applySetSpawnTimer
// ─────────────────────────────────────────────────────────────────────────────

describe('applySetSpawnTimer', () => {
  it('sets nextSpawnTarget = now + msFromNow', () => {
    const result = applySetSpawnTimer({}, 1, 60_000, T);
    expect(result[1].nextSpawnTarget).toBe(T + 60_000);
  });

  it('sets spawnSetAt = now', () => {
    const result = applySetSpawnTimer({}, 1, 60_000, T);
    expect(result[1].spawnSetAt).toBe(T);
  });

  it('resets treeStatus to none', () => {
    const result = applySetSpawnTimer({}, 1, 60_000, T);
    expect(result[1].treeStatus).toBe('none');
  });

  it('clears any existing tree state', () => {
    const states = {
      1: { treeStatus: 'alive' as const, treeType: 'oak' as const, treeHealth: 80, matureAt: T },
    };
    const result = applySetSpawnTimer(states, 1, 60_000, T);
    expect(result[1].treeType).toBeUndefined();
    expect(result[1].treeHealth).toBeUndefined();
    expect(result[1].matureAt).toBeUndefined();
  });

  it('preserves optional treeHint when provided', () => {
    const result = applySetSpawnTimer({}, 1, 60_000, T, { treeHint: 'Near the bank' });
    expect(result[1].treeHint).toBe('Near the bank');
  });

  it('leaves treeHint undefined when not provided', () => {
    const result = applySetSpawnTimer({}, 1, 60_000, T);
    expect(result[1].treeHint).toBeUndefined();
  });

  it('does not touch other worlds', () => {
    const states = { 2: { treeStatus: 'alive' as const } };
    const result = applySetSpawnTimer(states, 1, 60_000, T);
    expect(result[2]).toBe(states[2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applySetTreeInfo
// ─────────────────────────────────────────────────────────────────────────────

describe('applySetTreeInfo', () => {
  it('sapling type → treeStatus sapling', () => {
    const result = applySetTreeInfo({}, 1, { treeType: 'sapling', treeHint: '' }, T);
    expect(result[1].treeStatus).toBe('sapling');
  });

  it('sapling-oak → treeStatus sapling', () => {
    const result = applySetTreeInfo({}, 1, { treeType: 'sapling-oak', treeHint: '' }, T);
    expect(result[1].treeStatus).toBe('sapling');
  });

  it('sapling type → matureAt = now + SAPLING_MATURE_MS', () => {
    const result = applySetTreeInfo({}, 1, { treeType: 'sapling', treeHint: '' }, T);
    expect(result[1].matureAt).toBe(T + SAPLING_MATURE_MS);
  });

  it('mature type → treeStatus mature', () => {
    const result = applySetTreeInfo({}, 1, { treeType: 'mature', treeHint: '' }, T);
    expect(result[1].treeStatus).toBe('mature');
  });

  it('alive tree type (oak) → treeStatus alive', () => {
    const result = applySetTreeInfo({}, 1, { treeType: 'oak', treeHint: 'East side' }, T);
    expect(result[1].treeStatus).toBe('alive');
  });

  it('alive tree type (yew) → treeStatus alive', () => {
    const result = applySetTreeInfo({}, 1, { treeType: 'yew', treeHint: '' }, T);
    expect(result[1].treeStatus).toBe('alive');
  });

  it('sets treeSetAt = now', () => {
    const result = applySetTreeInfo({}, 1, { treeType: 'oak', treeHint: '' }, T);
    expect(result[1].treeSetAt).toBe(T);
  });

  it('clears deadAt, nextSpawnTarget, spawnSetAt', () => {
    const states = {
      1: { treeStatus: 'dead' as const, deadAt: T - 1000, nextSpawnTarget: T + 5000, spawnSetAt: T - 500 },
    };
    const result = applySetTreeInfo(states, 1, { treeType: 'oak', treeHint: '' }, T);
    expect(result[1].deadAt).toBeUndefined();
    expect(result[1].nextSpawnTarget).toBeUndefined();
    expect(result[1].spawnSetAt).toBeUndefined();
  });

  it('stores treeHint and treeExactLocation from payload', () => {
    const result = applySetTreeInfo({}, 1, {
      treeType: 'oak',
      treeHint: 'South area',
      treeExactLocation: 'Lumbridge swamp',
      treeHealth: 75,
    }, T);
    expect(result[1].treeHint).toBe('South area');
    expect(result[1].treeExactLocation).toBe('Lumbridge swamp');
    expect(result[1].treeHealth).toBe(75);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyUpdateTreeFields
// ─────────────────────────────────────────────────────────────────────────────

describe('applyUpdateTreeFields', () => {
  it('returns unchanged state when world does not exist', () => {
    const states = {};
    const result = applyUpdateTreeFields(states, 99, { treeHint: 'new hint' });
    expect(result).toBe(states);
  });

  it('updates hint on existing world', () => {
    const states = { 1: { treeStatus: 'alive' as const, treeHint: 'old' } };
    const result = applyUpdateTreeFields(states, 1, { treeHint: 'new' });
    expect(result[1].treeHint).toBe('new');
  });

  it('upgrades sapling → alive when treeType is an alive tree type', () => {
    const states = { 1: { treeStatus: 'sapling' as const } };
    const result = applyUpdateTreeFields(states, 1, { treeType: 'willow' });
    expect(result[1].treeStatus).toBe('alive');
  });

  it('upgrades mature → alive when treeType is an alive tree type', () => {
    const states = { 1: { treeStatus: 'mature' as const } };
    const result = applyUpdateTreeFields(states, 1, { treeType: 'elder' });
    expect(result[1].treeStatus).toBe('alive');
  });

  it('does not upgrade alive → alive (no-op status change)', () => {
    const states = { 1: { treeStatus: 'alive' as const, treeType: 'oak' as const } };
    const result = applyUpdateTreeFields(states, 1, { treeType: 'maple' });
    expect(result[1].treeStatus).toBe('alive');
  });

  it('does not upgrade status when treeType is not an alive type', () => {
    const states = { 1: { treeStatus: 'sapling' as const } };
    const result = applyUpdateTreeFields(states, 1, { treeType: 'sapling-oak' });
    expect(result[1].treeStatus).toBe('sapling');
  });

  it('does not change other worlds', () => {
    const states = {
      1: { treeStatus: 'alive' as const },
      2: { treeStatus: 'dead' as const },
    };
    const result = applyUpdateTreeFields(states, 1, { treeHint: 'x' });
    expect(result[2]).toBe(states[2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyUpdateHealth
// ─────────────────────────────────────────────────────────────────────────────

describe('applyUpdateHealth', () => {
  it('sets treeHealth on existing world', () => {
    const states = { 1: { treeStatus: 'alive' as const } };
    const result = applyUpdateHealth(states, 1, 60);
    expect(result[1].treeHealth).toBe(60);
  });

  it('clears treeHealth when called with undefined', () => {
    const states = { 1: { treeStatus: 'alive' as const, treeHealth: 80 } };
    const result = applyUpdateHealth(states, 1, undefined);
    expect(result[1].treeHealth).toBeUndefined();
  });

  it('returns unchanged state when world does not exist', () => {
    const states = {};
    const result = applyUpdateHealth(states, 99, 50);
    expect(result).toBe(states);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyMarkDead
// ─────────────────────────────────────────────────────────────────────────────

describe('applyMarkDead', () => {
  it('sets treeStatus to dead', () => {
    const result = applyMarkDead({}, 1, T);
    expect(result[1].treeStatus).toBe('dead');
  });

  it('sets deadAt to now', () => {
    const result = applyMarkDead({}, 1, T);
    expect(result[1].deadAt).toBe(T);
  });

  it('clears treeHealth', () => {
    const states = { 1: { treeStatus: 'alive' as const, treeHealth: 40 } };
    const result = applyMarkDead(states, 1, T);
    expect(result[1].treeHealth).toBeUndefined();
  });

  it('clears nextSpawnTarget and spawnSetAt', () => {
    const states = {
      1: { treeStatus: 'none' as const, nextSpawnTarget: T + 1000, spawnSetAt: T },
    };
    const result = applyMarkDead(states, 1, T);
    expect(result[1].nextSpawnTarget).toBeUndefined();
    expect(result[1].spawnSetAt).toBeUndefined();
  });

  it('works on a world with no prior state', () => {
    const result = applyMarkDead({}, 1, T);
    expect(result[1].treeStatus).toBe('dead');
    expect(result[1].deadAt).toBe(T);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyClearWorld
// ─────────────────────────────────────────────────────────────────────────────

describe('applyClearWorld', () => {
  it('removes the world from state', () => {
    const states = { 1: { treeStatus: 'alive' as const } };
    const result = applyClearWorld(states, 1);
    expect(result[1]).toBeUndefined();
  });

  it('does not affect other worlds', () => {
    const states = {
      1: { treeStatus: 'alive' as const },
      2: { treeStatus: 'dead' as const },
    };
    const result = applyClearWorld(states, 1);
    expect(result[2]).toBeDefined();
    expect(result[2].treeStatus).toBe('dead');
  });

  it('handles clearing a world that was never set', () => {
    const states = { 2: { treeStatus: 'alive' as const } };
    const result = applyClearWorld(states, 99);
    expect(result[2]).toBe(states[2]);
  });
});
