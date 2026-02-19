import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import worldsConfig from './data/worlds.json';
import { useWorldStates } from './hooks/useWorldStates';
import { useSession } from './hooks/useSession';
import { useFavorites } from './hooks/useFavorites';
import { WorldCard } from './components/WorldCard';
import { SpawnTimerView } from './components/SpawnTimerView';
import { TreeInfoView } from './components/TreeInfoView';
import { TreeDeadView } from './components/TreeDeadView';
import { WorldDetailView } from './components/WorldDetailView';
import { SessionBar } from './components/SessionBar';
import { SortFilterBar, DEFAULT_FILTERS } from './components/SortFilterBar';
import type { SortMode, Filters } from './components/SortFilterBar';
import type { WorldConfig, WorldState } from './types';
import { ALIVE_DEAD_MS, DEAD_CLEAR_MS } from './constants/evilTree';

const worlds = worldsConfig.worlds as WorldConfig[];

type ActiveView =
  | { kind: 'grid' }
  | { kind: 'spawn' | 'tree' | 'dead' | 'detail'; worldId: number };

function isActive(state: WorldState): boolean {
  return state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined;
}

const SORT_STORAGE_KEY = 'evilTree_sort';

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
    treeTypes: v.treeTypes as string[],
    hint: v.hint as 'needs' | 'has' | null,
    location: v.location as 'needs' | 'has' | null,
    health: v.health as 'needs' | 'has' | null,
    intel: v.intel as 'needs' | 'has' | null,
  };
}

function loadSortPrefs(): { mode: SortMode; asc: boolean } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { mode: normalizeSortMode(parsed.mode), asc: parsed.asc ?? true };
    }
  } catch { /* ignore */ }
  return { mode: 'world', asc: true };
}

const FILTER_STORAGE_KEY = 'evilTree_filters';

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) return normalizeFilters(JSON.parse(raw));
  } catch { /* ignore */ }
  return DEFAULT_FILTERS;
}

export default function App() {
  const handleSessionLost = useCallback(() => {
    saveToLocalStorageRef.current();
  }, []);
  const { session, syncChannel, createSession, joinSession, rejoinSession, leaveSession, dismissError } = useSession(handleSessionLost);
  const { worldStates, setSpawnTimer, setTreeInfo, updateTreeFields, updateHealth, markDead, clearWorld, saveToLocalStorage } = useWorldStates(syncChannel);
  const saveToLocalStorageRef = useRef(saveToLocalStorage);
  saveToLocalStorageRef.current = saveToLocalStorage;
  const { favorites, toggleFavorite } = useFavorites();

  const handleCreateSession = useCallback(() => {
    return createSession(worldStates);
  }, [createSession, worldStates]);

  const handleLeaveSession = useCallback(() => {
    saveToLocalStorage();
    leaveSession();
  }, [saveToLocalStorage, leaveSession]);
  const [activeView, setActiveView] = useState<ActiveView>({ kind: 'grid' });
  const [sortMode, setSortMode] = useState<SortMode>(() => loadSortPrefs().mode);
  const [sortAsc, setSortAsc] = useState(() => loadSortPrefs().asc);
  const [filters, setFilters] = useState<Filters>(loadFilters);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ mode: sortMode, asc: sortAsc }));
  }, [sortMode, sortAsc]);

  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const sortedFilteredWorlds = useMemo(() => {
    // Filter
    let result = worlds.filter(w => {
      const state = worldStates[w.id] ?? { treeStatus: 'none' as const };
      const active = isActive(state);

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
  }, [worldStates, favorites, sortMode, sortAsc, filters]);

  function handleOpenTool(worldId: number, tool: 'spawn' | 'tree' | 'dead') {
    setActiveView({ kind: tool, worldId });
  }

  function handleOpenCard(worldId: number) {
    setActiveView({ kind: 'detail', worldId });
  }

  function handleBack() {
    setActiveView({ kind: 'grid' });
  }

  // Full-screen view rendering
  if (activeView.kind !== 'grid') {
    const { worldId } = activeView;
    const world = worlds.find(w => w.id === worldId)!;

    if (activeView.kind === 'spawn')
      return <SpawnTimerView
        world={world}
        onSubmit={(ms, info) => { setSpawnTimer(worldId, ms, info); handleBack(); }}
        onBack={handleBack}
      />;
    if (activeView.kind === 'tree') {
      const currentState = worldStates[worldId] ?? { treeStatus: 'none' as const };
      const existingState = (currentState.treeStatus === 'sapling' || currentState.treeStatus === 'mature' || currentState.treeStatus === 'alive')
        ? currentState : undefined;
      return <TreeInfoView
        world={world}
        existingState={existingState}
        onSubmit={(info) => { setTreeInfo(worldId, info); handleBack(); }}
        onUpdate={(fields) => { updateTreeFields(worldId, fields); handleBack(); }}
        onBack={handleBack}
      />;
    }
    if (activeView.kind === 'dead')
      return <TreeDeadView
        world={world}
        onConfirm={() => { markDead(worldId); handleBack(); }}
        onBack={handleBack}
      />;
    if (activeView.kind === 'detail')
      return <WorldDetailView
        world={world}
        state={worldStates[worldId] ?? { treeStatus: 'none' }}
        isFavorite={favorites.has(worldId)}
        onToggleFavorite={() => toggleFavorite(worldId)}
        onClear={() => { clearWorld(worldId); handleBack(); }}
        onUpdateHealth={(health) => updateHealth(worldId, health)}
        onUpdateFields={(fields) => updateTreeFields(worldId, fields)}
        onBack={handleBack}
        onOpenTool={(tool) => handleOpenTool(worldId, tool)}
      />;
  }

  // Grid view
  return (
    <div className="flex flex-col min-h-screen p-1.5 gap-1.5">
      <header className="flex items-center justify-between px-2 py-1 bg-gray-800 rounded flex-shrink-0">
        <h1 className="text-base font-bold text-amber-400 tracking-wide">
          Ecto Trees
          <small className="ms-2 text-xs font-light">Turning Evil Trees into dead trees.</small>
        </h1>
        <span className="text-[10px] text-gray-500">{worlds.filter(w => isActive(worldStates[w.id] ?? { treeStatus: 'none' })).length}/{worlds.length} worlds scouted</span>
      </header>

      <SessionBar
        session={session}
        onCreateSession={handleCreateSession}
        onJoinSession={joinSession}
        onRejoinSession={rejoinSession}
        onLeaveSession={handleLeaveSession}
        onDismissError={dismissError}
      />

      <SortFilterBar
        sortMode={sortMode}
        setSortMode={setSortMode}
        sortAsc={sortAsc}
        setSortAsc={setSortAsc}
        filters={filters}
        setFilters={setFilters}
      />

      {sortedFilteredWorlds.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
          <p className="text-sm">No worlds match the current filters. =(</p>
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <main
          className="flex-1 overflow-visible"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
            gap: '3px',
            alignContent: 'start',
          }}
        >
          {sortedFilteredWorlds.map(world => (
            <WorldCard
              key={world.id}
              world={world}
              state={worldStates[world.id] ?? { treeStatus: 'none' }}
              isFavorite={favorites.has(world.id)}
              onToggleFavorite={() => toggleFavorite(world.id)}
              onCardClick={() => handleOpenCard(world.id)}
              onOpenTool={(tool) => handleOpenTool(world.id, tool)}
            />
          ))}
        </main>
      )}
    </div>
  );
}
