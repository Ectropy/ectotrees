import type { WorldState } from '../types';

/**
 * Shared fallback for worlds with no recorded state. A single frozen instance
 * keeps memoized consumers (e.g. React.memo(WorldCard)) referentially stable
 * across renders.
 */
export const NONE_STATE: WorldState = Object.freeze({ treeStatus: 'none' });
