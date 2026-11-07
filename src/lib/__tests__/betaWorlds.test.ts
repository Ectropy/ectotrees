import { describe, it, expect } from 'vitest';
import type { WorldConfig, WorldStates } from '../../types';
import { gateBetaWorlds } from '../betaWorlds';

const MAIN: WorldConfig = { id: 1, type: 'P2P' };
const BETA_F2P: WorldConfig = { id: 203, type: 'F2P', beta: true };
const BETA_P2P: WorldConfig = { id: 204, type: 'P2P', beta: true };
const WORLDS = [MAIN, BETA_F2P, BETA_P2P];

const ids = (worlds: WorldConfig[]) => worlds.map(w => w.id);

describe('gateBetaWorlds', () => {
  it('hides beta worlds with no intel and no search', () => {
    expect(ids(gateBetaWorlds(WORLDS, {}, ''))).toEqual([1]);
  });

  it('shows a beta world with an active tree', () => {
    const states: WorldStates = { 203: { treeStatus: 'alive' } };
    expect(ids(gateBetaWorlds(WORLDS, states, ''))).toEqual([1, 203]);
  });

  it('shows a beta world with only a spawn timer', () => {
    const states: WorldStates = { 204: { treeStatus: 'none', nextSpawnTarget: 123 } };
    expect(ids(gateBetaWorlds(WORLDS, states, ''))).toEqual([1, 204]);
  });

  it('hides a beta world whose state lapsed back to none', () => {
    const states: WorldStates = { 203: { treeStatus: 'none' } };
    expect(ids(gateBetaWorlds(WORLDS, states, ''))).toEqual([1]);
  });

  it('shows a beta world only on an exact search match', () => {
    expect(ids(gateBetaWorlds(WORLDS, {}, ' 203 '))).toEqual([1, 203]);
    expect(ids(gateBetaWorlds(WORLDS, {}, '20'))).toEqual([1]);
  });

  it('never filters non-beta worlds', () => {
    expect(ids(gateBetaWorlds([MAIN], {}, '999'))).toEqual([1]);
  });
});
