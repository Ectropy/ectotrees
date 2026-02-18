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
import { ALIVE_DEAD_MS } from './constants/evilTree';

const worlds = worldsConfig.worlds as WorldConfig[];

type ActiveView =
  | { kind: 'grid' }
  | { kind: 'spawn' | 'tree' | 'dead' | 'detail'; worldId: number };

function isActive(state: WorldState): boolean {
  return state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined;
}

const SORT_STORAGE_KEY = 'evilTree_sort';

function loadSortPrefs(): { mode: SortMode; asc: boolean } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { mode: parsed.mode ?? 'world', asc: parsed.asc ?? true };
    }
  } catch { /* ignore */ }
  return { mode: 'world', asc: true };
}

const FILTER_STORAGE_KEY = 'evilTree_filters';

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
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
      if (filters.active && !active) return false;
      if (filters.noData && active) return false;
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
      // Health sort: only show worlds with known health
      if (sortMode === 'health' && state.treeHealth === undefined) return false;

      // Hint tri-state filter
      if (filters.hint !== null) {
        const hasHint = state.nextSpawnTarget !== undefined && !!state.treeHint;
        const needsHint = state.nextSpawnTarget !== undefined && !state.treeHint;
        if (filters.hint === 'needs' && !needsHint) return false;
        if (filters.hint === 'has' && !hasHint) return false;
      }

      // Location tri-state filter
      if (filters.location !== null) {
        const isSpawned = state.treeStatus === 'sapling' || state.treeStatus === 'mature' || state.treeStatus === 'alive';
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

        case 'active': {
          const actA = isActive(stateA) ? 0 : 1;
          const actB = isActive(stateB) ? 0 : 1;
          cmp = actA - actB || a.id - b.id;
          break;
        }

        case 'spawn': {
          const spA = stateA.nextSpawnTarget;
          const spB = stateB.nextSpawnTarget;
          if (spA !== undefined && spB !== undefined) {
            cmp = spA - spB;
          } else if (spA !== undefined) {
            cmp = -1; // A has spawn, push to front
          } else if (spB !== undefined) {
            cmp = 1;  // B has spawn, push to front
          } else {
            cmp = a.id - b.id;
          }
          break;
        }

        case 'ending': {
          const deathA = (stateA.treeStatus === 'mature' || stateA.treeStatus === 'alive') && stateA.matureAt !== undefined
            ? stateA.matureAt + ALIVE_DEAD_MS : undefined;
          const deathB = (stateB.treeStatus === 'mature' || stateB.treeStatus === 'alive') && stateB.matureAt !== undefined
            ? stateB.matureAt + ALIVE_DEAD_MS : undefined;
          if (deathA !== undefined && deathB !== undefined) {
            cmp = deathA - deathB;
          } else if (deathA !== undefined) {
            cmp = -1;
          } else if (deathB !== undefined) {
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
          cmp = (stateA.treeHealth ?? 0) - (stateB.treeHealth ?? 0) || a.id - b.id;
          break;
        }
      }

      // For spawn/death: worlds without timers always go to end, so only flip
      // the comparison for worlds that both have (or both lack) the relevant data
      if (sortMode === 'spawn') {
        const spA = stateA.nextSpawnTarget;
        const spB = stateB.nextSpawnTarget;
        if (spA !== undefined && spB !== undefined) return sortAsc ? cmp : -cmp;
        return cmp; // keep "no timer" worlds at end regardless of direction
      }
      if (sortMode === 'ending') {
        const deathA = (stateA.treeStatus === 'mature' || stateA.treeStatus === 'alive') && stateA.matureAt !== undefined;
        const deathB = (stateB.treeStatus === 'mature' || stateB.treeStatus === 'alive') && stateB.matureAt !== undefined;
        if (deathA && deathB) return sortAsc ? cmp : -cmp;
        return cmp;
      }

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
