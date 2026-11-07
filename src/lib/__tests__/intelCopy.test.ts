import { describe, it, expect } from 'vitest';
import type { WorldConfig, WorldState } from '../../types';
import { buildWorldIntel } from '../intelCopy';

const STATE: WorldState = { treeStatus: 'alive', treeType: 'oak', matureAt: 1_000_000 };

describe('buildWorldIntel', () => {
  it('suffixes a Beta world name with (Beta)', () => {
    const world: WorldConfig = { id: 203, type: 'F2P', beta: true };
    expect(buildWorldIntel(world, STATE)).toMatch(/^World `203` \(Beta\)/);
  });

  it('leaves non-Beta world names unchanged', () => {
    const world: WorldConfig = { id: 1, type: 'P2P' };
    const line = buildWorldIntel(world, STATE);
    expect(line).toMatch(/^World `1`/);
    expect(line).not.toContain('(Beta)');
  });
});
