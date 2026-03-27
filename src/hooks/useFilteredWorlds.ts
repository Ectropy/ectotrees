import { useMemo } from 'react';
import type { WorldConfig, WorldState, WorldStates } from '../types';
import type { SortMode, Filters } from '../components/SortFilterBar';
import { DEFAULT_FILTERS } from '../components/SortFilterBar';
import { ALIVE_DEAD_MS, DEAD_CLEAR_MS } from '../constants/evilTree';

// --- localStorage persistence helpers ---

const SORT_STORAGE_KEY = 'evilTree_sort';
const FILTER_STORAGE_KEY = 'evilTree_filters';

function normalizeSortMode(value: unknown): SortMode {
  return (value === 'world' || value === 'soonest' || value === 'fav' || value === 'health')
    ? value
    : 'world';
}

function normalizeFilters(value: unknown): Filters {
  if (!value || typeof value !== 'object') return DEFAULT_FILTERS;
  const v = value as Record<string, unknown>;
  if (
    typeof v.favorites !== 'boolean' ||
    typeof v.p2p !== 'boolean' ||
    typeof v.f2p !== 'boolean' ||
    !Array.isArray(v.treeTypes) ||
    !v.treeTypes.every(t => typeof t === 'string') ||
    (v.hint !== null && v.hint !== 'needs' && v.hint !== 'has') ||
    (v.location !== null && v.location !== 'needs' && v.location !== 'has') ||
    (v.health !== null && v.health !== 'needs' && v.health !== 'has') ||
    (v.intel !== null && v.intel !== 'needs' && v.intel !== 'has')
  ) {
    return DEFAULT_FILTERS;
  }
  return {
    favorites: v.favorites as boolean,
    p2p: v.p2p as boolean,
    f2p: v.f2p as boolean,
    hidden: (v.hidden === 'show' || v.hidden === 'only') ? v.hidden : null,
    treeTypes: v.treeTypes as string[],
    hint: v.hint as 'needs' | 'has' | null,
    location: v.location as 'needs' | 'has' | null,
    health: v.health as 'needs' | 'has' | null,
    intel: v.intel as 'needs' | 'has' | null,
  };
}

export function loadSortPrefs(): { mode: SortMode; asc: boolean } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { mode: normalizeSortMode(parsed.mode), asc: parsed.asc ?? true };
    }
  } catch { /* ignore */ }
  return { mode: 'world', asc: true };
}

export function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) return normalizeFilters(JSON.parse(raw));
  } catch { /* ignore */ }
  return DEFAULT_FILTERS;
}

export { SORT_STORAGE_KEY, FILTER_STORAGE_KEY };

// --- Filtering & sorting hook ---

export function isActive(state: WorldState): boolean {
  return state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined;
}

export function useFilteredWorlds(
  worlds: WorldConfig[],
  worldStates: WorldStates,
  favorites: Set<number>,
  hiddenWorlds: Set<number>,
  sortMode: SortMode,
  sortAsc: boolean,
  filters: Filters,
  worldSearch: string,
): WorldConfig[] {
  return useMemo(() => {
    // Filter
    const searchTrimmed = worldSearch.trim();
    let result = worlds.filter(w => {
      const matchesSearch = searchTrimmed && String(w.id) === searchTrimmed;
      if (searchTrimmed && !matchesSearch) return false;
      if (matchesSearch) return true;
      const state = worldStates[w.id] ?? { treeStatus: 'none' as const };
      const active = isActive(state);

      // Hidden filter: off = exclude hidden, 'show' = include all, 'only' = only hidden
      if (filters.hidden === null && hiddenWorlds.has(w.id)) return false;
      if (filters.hidden === 'only' && !hiddenWorlds.has(w.id)) return false;

      if (filters.favorites && !favorites.has(w.id)) return false;
      if (filters.intel === 'needs' && active) return false;
      if (filters.intel === 'has' && !active) return false;
      if (filters.p2p && w.type !== 'P2P') return false;
      if (filters.f2p && w.type !== 'F2P') return false;
      if (filters.treeTypes.length > 0) {
        if (!active) return false;
        const treeFilterKey = !state.treeType || state.treeType === 'mature'
          ? 'unknown'
          : (state.treeType === 'sapling' || state.treeType.startsWith('sapling-'))
            ? 'sapling'
            : state.treeType;
        if (!filters.treeTypes.includes(treeFilterKey)) return false;
      }
      // Hint tri-state filter
      if (filters.hint !== null) {
        const isSpawned = state.treeStatus === 'sapling' || state.treeStatus === 'mature' || state.treeStatus === 'alive' || state.treeStatus === 'dead';
        const isWaitingForSpawn = state.nextSpawnTarget !== undefined;
        const hasHint = (isWaitingForSpawn && (!!state.treeHint || !!state.treeExactLocation)) ||
                        (isSpawned && (!!state.treeHint || !!state.treeExactLocation));
        const needsHint = (isWaitingForSpawn && !state.treeHint && !state.treeExactLocation) ||
                          (isSpawned && !state.treeHint && !state.treeExactLocation);
        if (filters.hint === 'needs' && !needsHint) return false;
        if (filters.hint === 'has' && !hasHint) return false;
      }

      // Location tri-state filter
      if (filters.location !== null) {
        const isSpawned = state.treeStatus === 'sapling' || state.treeStatus === 'mature' || state.treeStatus === 'alive' || state.treeStatus === 'dead';
        const hasLocation = isSpawned && !!state.treeExactLocation;
        const needsLocation = isSpawned && !state.treeExactLocation;
        if (filters.location === 'needs' && !needsLocation) return false;
        if (filters.location === 'has' && !hasLocation) return false;
      }

      // Health tri-state filter
      if (filters.health !== null) {
        const isAlive = state.treeStatus === 'mature' || state.treeStatus === 'alive';
        const hasHealth = isAlive && state.treeHealth !== undefined;
        const needsHealth = isAlive && state.treeHealth === undefined;
        if (filters.health === 'needs' && !needsHealth) return false;
        if (filters.health === 'has' && !hasHealth) return false;
      }

      return true;
    });

    // Sort
    result = [...result].sort((a, b) => {
      const stateA = worldStates[a.id] ?? { treeStatus: 'none' as const };
      const stateB = worldStates[b.id] ?? { treeStatus: 'none' as const };
      let cmp = 0;

      switch (sortMode) {
        case 'world':
          cmp = a.id - b.id;
          break;

        case 'soonest': {
          const despawnA = stateA.treeStatus === 'dead' && stateA.deadAt !== undefined
            ? stateA.deadAt + DEAD_CLEAR_MS
            : undefined;
          const despawnB = stateB.treeStatus === 'dead' && stateB.deadAt !== undefined
            ? stateB.deadAt + DEAD_CLEAR_MS
            : undefined;
          const endingA = (stateA.treeStatus === 'mature' || stateA.treeStatus === 'alive') && stateA.matureAt !== undefined
            ? stateA.matureAt + ALIVE_DEAD_MS
            : undefined;
          const endingB = (stateB.treeStatus === 'mature' || stateB.treeStatus === 'alive') && stateB.matureAt !== undefined
            ? stateB.matureAt + ALIVE_DEAD_MS
            : undefined;
          const saplingA = stateA.treeStatus === 'sapling' ? stateA.matureAt : undefined;
          const saplingB = stateB.treeStatus === 'sapling' ? stateB.matureAt : undefined;
          const spawnA = stateA.nextSpawnTarget;
          const spawnB = stateB.nextSpawnTarget;

          const bucketA = despawnA !== undefined ? 0 : endingA !== undefined ? 1 : saplingA !== undefined ? 2 : spawnA !== undefined ? 3 : 4;
          const bucketB = despawnB !== undefined ? 0 : endingB !== undefined ? 1 : saplingB !== undefined ? 2 : spawnB !== undefined ? 3 : 4;
          if (bucketA !== bucketB) {
            // In "soonest", urgency groups are dead -> ending -> sapling -> spawn.
            // In "latest", reverse those groups to spawn -> sapling -> ending -> dead.
            // Worlds with no relevant timers stay last in both directions.
            if (bucketA === 4 || bucketB === 4) {
              cmp = bucketA - bucketB;
            } else {
              cmp = sortAsc ? (bucketA - bucketB) : (bucketB - bucketA);
            }
            break;
          }

          const eventA = bucketA === 0 ? despawnA : bucketA === 1 ? endingA : bucketA === 2 ? saplingA : bucketA === 3 ? spawnA : undefined;
          const eventB = bucketB === 0 ? despawnB : bucketB === 1 ? endingB : bucketB === 2 ? saplingB : bucketB === 3 ? spawnB : undefined;

          if (eventA !== undefined && eventB !== undefined) {
            cmp = sortAsc ? eventA - eventB : eventB - eventA;
          } else if (eventA !== undefined) {
            cmp = -1;
          } else if (eventB !== undefined) {
            cmp = 1;
          } else {
            cmp = a.id - b.id;
          }
          break;
        }

        case 'fav': {
          const favA = favorites.has(a.id) ? 0 : 1;
          const favB = favorites.has(b.id) ? 0 : 1;
          cmp = favA - favB || a.id - b.id;
          break;
        }

        case 'health': {
          const hasHealthA = stateA.treeHealth !== undefined;
          const hasHealthB = stateB.treeHealth !== undefined;
          const aliveNoHealthA = !hasHealthA && (stateA.treeStatus === 'mature' || stateA.treeStatus === 'alive');
          const aliveNoHealthB = !hasHealthB && (stateB.treeStatus === 'mature' || stateB.treeStatus === 'alive');
          const bucketA = hasHealthA ? 0 : aliveNoHealthA ? 1 : 2;
          const bucketB = hasHealthB ? 0 : aliveNoHealthB ? 1 : 2;

          if (bucketA !== bucketB) {
            cmp = bucketA - bucketB;
            break;
          }

          if (bucketA === 0) {
            cmp = sortAsc
              ? ((stateA.treeHealth as number) - (stateB.treeHealth as number))
              : ((stateB.treeHealth as number) - (stateA.treeHealth as number));
            if (cmp === 0) cmp = a.id - b.id;
          } else {
            cmp = a.id - b.id;
          }
          break;
        }
      }

      if (sortMode === 'soonest') return cmp;
      if (sortMode === 'health') return cmp;

      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [worlds, worldStates, favorites, hiddenWorlds, sortMode, sortAsc, filters, worldSearch]);
}
