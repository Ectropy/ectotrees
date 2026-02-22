import { describe, it, expect } from 'vitest';
import { validateMessage, validateInitializeState, validateSessionCode } from '../validation.ts';

// World IDs 1 and 2 are guaranteed to exist in worlds.json
const W = 1;
const MAX_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─────────────────────────────────────────────────────────────────────────────
// validateSessionCode
// ─────────────────────────────────────────────────────────────────────────────

describe('validateSessionCode', () => {
  it('accepts a valid 6-char uppercase alphanumeric code', () => {
    expect(validateSessionCode('AB3DEF')).toBe('AB3DEF');
  });

  it('returns null for non-string input', () => {
    expect(validateSessionCode(123456)).toBeNull();
    expect(validateSessionCode(null)).toBeNull();
    expect(validateSessionCode(undefined)).toBeNull();
  });

  it('returns null when too short', () => {
    expect(validateSessionCode('ABCDE')).toBeNull();
  });

  it('returns null when too long', () => {
    expect(validateSessionCode('ABCDEFG')).toBeNull();
  });

  it('returns null when it contains lowercase letters', () => {
    expect(validateSessionCode('ab3def')).toBeNull();
  });

  it('returns null when it contains special characters', () => {
    expect(validateSessionCode('ABC!EF')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateMessage — top-level checks
// ─────────────────────────────────────────────────────────────────────────────

describe('validateMessage — structural checks', () => {
  it('returns error for non-object input', () => {
    expect(validateMessage('hello')).toMatchObject({ error: expect.any(String) });
    expect(validateMessage(null)).toMatchObject({ error: expect.any(String) });
    expect(validateMessage(42)).toMatchObject({ error: expect.any(String) });
  });

  it('returns error for unknown message type', () => {
    expect(validateMessage({ type: 'teleport', worldId: W })).toMatchObject({ error: expect.stringContaining('Unknown') });
  });

  it('returns error for missing worldId on mutation messages', () => {
    expect(validateMessage({ type: 'markDead' })).toMatchObject({ error: expect.any(String) });
  });

  it('returns error for invalid worldId (non-existent world)', () => {
    expect(validateMessage({ type: 'markDead', worldId: 99999 })).toMatchObject({ error: expect.any(String) });
  });

  it('returns error for invalid msgId (float)', () => {
    expect(validateMessage({ type: 'markDead', worldId: W, msgId: 1.5 })).toMatchObject({ error: 'Invalid msgId.' });
  });

  it('returns error for invalid msgId (zero)', () => {
    expect(validateMessage({ type: 'markDead', worldId: W, msgId: 0 })).toMatchObject({ error: 'Invalid msgId.' });
  });

  it('returns error for invalid msgId (negative)', () => {
    expect(validateMessage({ type: 'markDead', worldId: W, msgId: -1 })).toMatchObject({ error: 'Invalid msgId.' });
  });

  it('returns error for invalid msgId (string)', () => {
    expect(validateMessage({ type: 'markDead', worldId: W, msgId: 'abc' })).toMatchObject({ error: 'Invalid msgId.' });
  });

  it('accepts a valid positive integer msgId', () => {
    const result = validateMessage({ type: 'markDead', worldId: W, msgId: 42 });
    expect(result).not.toHaveProperty('error');
    if (!('error' in result) && result.type === 'markDead') expect(result.msgId).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateMessage — ping
// ─────────────────────────────────────────────────────────────────────────────

describe('validateMessage — ping', () => {
  it('returns { type: ping }', () => {
    expect(validateMessage({ type: 'ping' })).toEqual({ type: 'ping' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateMessage — markDead / clearWorld
// ─────────────────────────────────────────────────────────────────────────────

describe('validateMessage — markDead', () => {
  it('succeeds with valid worldId', () => {
    const result = validateMessage({ type: 'markDead', worldId: W });
    expect(result).toMatchObject({ type: 'markDead', worldId: W });
  });
});

describe('validateMessage — clearWorld', () => {
  it('succeeds with valid worldId', () => {
    const result = validateMessage({ type: 'clearWorld', worldId: W });
    expect(result).toMatchObject({ type: 'clearWorld', worldId: W });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateMessage — setSpawnTimer
// ─────────────────────────────────────────────────────────────────────────────

describe('validateMessage — setSpawnTimer', () => {
  it('succeeds with valid msFromNow', () => {
    const result = validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: 60_000 });
    expect(result).toMatchObject({ type: 'setSpawnTimer', worldId: W, msFromNow: 60_000 });
  });

  it('accepts msFromNow at exactly 2 hours', () => {
    const result = validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: MAX_MS });
    expect(result).not.toHaveProperty('error');
  });

  it('rejects msFromNow above 2 hours', () => {
    expect(validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: MAX_MS + 1 })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects msFromNow of zero', () => {
    expect(validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: 0 })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects negative msFromNow', () => {
    expect(validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: -1 })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects non-integer msFromNow', () => {
    expect(validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: 60_000.5 })).toMatchObject({ error: expect.any(String) });
  });

  it('strips control characters from treeHint', () => {
    const result = validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: 60_000, treeInfo: { treeHint: 'Near\x00the\x1Fbank' } });
    expect(result).not.toHaveProperty('error');
    if (!('error' in result) && result.type === 'setSpawnTimer') {
      expect(result.treeInfo?.treeHint).toBe('Nearthebank');
    }
  });

  it('rejects treeHint longer than 200 characters', () => {
    const longHint = 'x'.repeat(201);
    expect(validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: 60_000, treeInfo: { treeHint: longHint } })).toMatchObject({ error: expect.any(String) });
  });

  it('succeeds without treeInfo', () => {
    const result = validateMessage({ type: 'setSpawnTimer', worldId: W, msFromNow: 60_000 });
    expect(result).not.toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateMessage — setTreeInfo
// ─────────────────────────────────────────────────────────────────────────────

describe('validateMessage — setTreeInfo', () => {
  const validInfo = { treeType: 'oak', treeHint: '' };

  it('succeeds with a valid info object', () => {
    const result = validateMessage({ type: 'setTreeInfo', worldId: W, info: validInfo });
    expect(result).not.toHaveProperty('error');
    expect(result).toMatchObject({ type: 'setTreeInfo', worldId: W });
  });

  it('rejects missing info object', () => {
    expect(validateMessage({ type: 'setTreeInfo', worldId: W })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects invalid treeType', () => {
    expect(validateMessage({ type: 'setTreeInfo', worldId: W, info: { treeType: 'dragon', treeHint: '' } })).toMatchObject({ error: 'Invalid treeType.' });
  });

  it('accepts all valid tree types', () => {
    const validTypes = ['sapling', 'sapling-oak', 'mature', 'oak', 'willow', 'maple', 'yew', 'magic', 'elder'];
    for (const treeType of validTypes) {
      const result = validateMessage({ type: 'setTreeInfo', worldId: W, info: { treeType, treeHint: '' } });
      expect(result, `treeType ${treeType} should be valid`).not.toHaveProperty('error');
    }
  });

  it('rejects treeHealth of 0', () => {
    expect(validateMessage({ type: 'setTreeInfo', worldId: W, info: { ...validInfo, treeHealth: 0 } })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects non-multiple-of-5 treeHealth', () => {
    expect(validateMessage({ type: 'setTreeInfo', worldId: W, info: { ...validInfo, treeHealth: 7 } })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects treeHealth above 100', () => {
    expect(validateMessage({ type: 'setTreeInfo', worldId: W, info: { ...validInfo, treeHealth: 105 } })).toMatchObject({ error: expect.any(String) });
  });

  it('accepts treeHealth of 5', () => {
    const result = validateMessage({ type: 'setTreeInfo', worldId: W, info: { ...validInfo, treeHealth: 5 } });
    expect(result).not.toHaveProperty('error');
  });

  it('accepts treeHealth of 100', () => {
    const result = validateMessage({ type: 'setTreeInfo', worldId: W, info: { ...validInfo, treeHealth: 100 } });
    expect(result).not.toHaveProperty('error');
  });

  it('accepts omitted treeHealth (optional)', () => {
    const result = validateMessage({ type: 'setTreeInfo', worldId: W, info: validInfo });
    expect(result).not.toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateMessage — updateTreeFields
// ─────────────────────────────────────────────────────────────────────────────

describe('validateMessage — updateTreeFields', () => {
  it('succeeds with a valid partial fields object', () => {
    const result = validateMessage({ type: 'updateTreeFields', worldId: W, fields: { treeHint: 'West side' } });
    expect(result).not.toHaveProperty('error');
  });

  it('rejects missing fields object', () => {
    expect(validateMessage({ type: 'updateTreeFields', worldId: W })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects invalid treeType in fields', () => {
    expect(validateMessage({ type: 'updateTreeFields', worldId: W, fields: { treeType: 'unknown' } })).toMatchObject({ error: 'Invalid treeType.' });
  });

  it('rejects invalid treeHealth in fields', () => {
    expect(validateMessage({ type: 'updateTreeFields', worldId: W, fields: { treeHealth: 13 } })).toMatchObject({ error: expect.any(String) });
  });

  it('accepts valid treeType in fields', () => {
    const result = validateMessage({ type: 'updateTreeFields', worldId: W, fields: { treeType: 'maple' } });
    expect(result).not.toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateMessage — updateHealth
// ─────────────────────────────────────────────────────────────────────────────

describe('validateMessage — updateHealth', () => {
  it('accepts valid health values (multiples of 5, 5–100)', () => {
    for (const h of [5, 10, 50, 95, 100]) {
      const result = validateMessage({ type: 'updateHealth', worldId: W, health: h });
      expect(result, `health ${h} should be valid`).not.toHaveProperty('error');
    }
  });

  it('rejects health of 0', () => {
    expect(validateMessage({ type: 'updateHealth', worldId: W, health: 0 })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects health of 7 (not a multiple of 5)', () => {
    expect(validateMessage({ type: 'updateHealth', worldId: W, health: 7 })).toMatchObject({ error: expect.any(String) });
  });

  it('rejects health of 101 (out of range)', () => {
    expect(validateMessage({ type: 'updateHealth', worldId: W, health: 101 })).toMatchObject({ error: expect.any(String) });
  });

  it('accepts undefined health (clears health)', () => {
    const result = validateMessage({ type: 'updateHealth', worldId: W, health: undefined });
    expect(result).not.toHaveProperty('error');
    expect(result).toMatchObject({ type: 'updateHealth', worldId: W });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateInitializeState
// ─────────────────────────────────────────────────────────────────────────────

describe('validateInitializeState', () => {
  it('returns error for non-object input', () => {
    expect(validateInitializeState('hello')).toMatchObject({ error: expect.any(String) });
  });

  it('returns error when worlds field is missing', () => {
    expect(validateInitializeState({ notWorlds: {} })).toMatchObject({ error: expect.any(String) });
  });

  it('accepts a valid worlds object and includes active worlds', () => {
    const input = {
      worlds: {
        [W]: { treeStatus: 'alive', treeType: 'oak', matureAt: Date.now() },
      },
    };
    const result = validateInitializeState(input);
    expect(result).not.toHaveProperty('error');
    if (!('error' in result)) {
      expect(result[W]).toBeDefined();
      expect(result[W].treeStatus).toBe('alive');
    }
  });

  it('excludes inactive worlds (treeStatus none, no nextSpawnTarget)', () => {
    const input = {
      worlds: {
        [W]: { treeStatus: 'none' },
      },
    };
    const result = validateInitializeState(input);
    if (!('error' in result)) {
      expect(result[W]).toBeUndefined();
    }
  });

  it('includes worlds with treeStatus none but an active nextSpawnTarget', () => {
    const input = {
      worlds: {
        [W]: { treeStatus: 'none', nextSpawnTarget: Date.now() + 60_000 },
      },
    };
    const result = validateInitializeState(input);
    if (!('error' in result)) {
      expect(result[W]).toBeDefined();
    }
  });

  it('silently skips invalid world IDs', () => {
    const input = {
      worlds: {
        99999: { treeStatus: 'alive' },
        [W]: { treeStatus: 'alive', matureAt: Date.now() },
      },
    };
    const result = validateInitializeState(input);
    if (!('error' in result)) {
      expect(result[99999]).toBeUndefined();
      expect(result[W]).toBeDefined();
    }
  });

  it('returns error when more than 200 worlds are provided', () => {
    const worlds: Record<string, unknown> = {};
    for (let i = 1; i <= 201; i++) {
      worlds[i] = { treeStatus: 'alive' };
    }
    const result = validateInitializeState({ worlds });
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it('silently skips entries with invalid treeType', () => {
    const input = {
      worlds: {
        [W]: { treeStatus: 'alive', treeType: 'banana' },
        2: { treeStatus: 'alive', matureAt: Date.now() },
      },
    };
    const result = validateInitializeState(input);
    if (!('error' in result)) {
      expect(result[W]).toBeUndefined();
      expect(result[2]).toBeDefined();
    }
  });
});
