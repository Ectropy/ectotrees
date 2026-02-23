export const TREE_TYPES = [
  'sapling',
  'sapling-tree',
  'sapling-oak',
  'sapling-willow',
  'sapling-maple',
  'sapling-yew',
  'sapling-magic',
  'sapling-elder',
  'mature',
  'tree',
  'oak',
  'willow',
  'maple',
  'yew',
  'magic',
  'elder',
] as const;

export type TreeType = (typeof TREE_TYPES)[number];

export const ALIVE_TREE_TYPES: ReadonlySet<string> = new Set([
  'tree', 'oak', 'willow', 'maple', 'yew', 'magic', 'elder',
]);

export const SAPLING_MATURE_MS  = 5 * 60 * 1000;
export const ALIVE_DEAD_MS      = 30 * 60 * 1000;
export const DEAD_CLEAR_MS      = 10 * 60 * 1000;
export const LIGHTNING_1_MS     = 10 * 60 * 1000; // 10 min from matureAt → 50% cap
export const LIGHTNING_2_MS     = 20 * 60 * 1000; // 20 min from matureAt → 25% cap
export const HEALTH_LIGHTNING_1 = 50;
export const HEALTH_LIGHTNING_2 = 25;

export interface WorldState {
  nextSpawnTarget?: number;
  spawnSetAt?: number;
  treeStatus: 'none' | 'sapling' | 'mature' | 'alive' | 'dead';
  treeType?: TreeType;
  treeHint?: string;
  treeExactLocation?: string;
  treeHealth?: number;
  treeSetAt?: number;
  matureAt?: number;
  deadAt?: number;
}

export type WorldStates = Record<number, WorldState>;

export interface TreeInfoPayload {
  treeType: TreeType;
  treeHint: string;
  treeExactLocation?: string;
  treeHealth?: number;
}

export interface TreeFieldsPayload {
  treeType?: TreeType;
  treeHint?: string;
  treeExactLocation?: string;
  treeHealth?: number;
}

export interface SpawnTreeInfo {
  treeHint?: string;
  treeExactLocation?: string;
}
