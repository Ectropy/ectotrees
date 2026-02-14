import type { TreeType } from '../constants/evilTree';

export interface WorldConfig {
  id: number;
  type: 'P2P' | 'F2P';
}

export interface WorldState {
  nextSpawnTarget?: number;
  spawnSetAt?: number;
  treeStatus: 'none' | 'sapling' | 'mature' | 'alive' | 'dead';
  treeType?: TreeType;
  treeHint?: string;
  treeExactLocation?: string;
  treeSetAt?: number;
  matureAt?: number;
  deadAt?: number;
}

export type WorldStates = Record<number, WorldState>;

export interface TreeInfoPayload {
  treeType: TreeType;
  treeHint: string;
  treeExactLocation?: string;
}
