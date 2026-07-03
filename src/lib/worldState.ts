import type { WorldState } from '../types';

/**
 * Shared fallback for worlds with no recorded state. A single frozen instance
 * keeps memoized consumers (e.g. React.memo(WorldCard)) referentially stable
 * across renders.
 */
export const NONE_STATE: WorldState = Object.freeze({ treeStatus: 'none' });

/** A world counts as active when it has any tree state or a pending spawn timer. */
export function isActive(state: WorldState): boolean {
  return state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined;
}

/** Field-wise equality over the user-visible world state (ignores bookkeeping timestamps). */
export function worldStatesEqual(a: WorldState, b: WorldState): boolean {
  return a.treeStatus === b.treeStatus
    && a.nextSpawnTarget === b.nextSpawnTarget
    && a.treeType === b.treeType
    && a.treeHint === b.treeHint
    && a.treeExactLocation === b.treeExactLocation
    && a.treeHealth === b.treeHealth;
}
