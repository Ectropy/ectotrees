import { useEffect, useState } from 'react';
import { FILTERABLE_TREE_TYPES } from '../constants/evilTree';

export type SortMode = 'world' | 'soonest' | 'fav' | 'health';

export interface Filters {
  favorites: boolean;
  p2p: boolean;
  f2p: boolean;
  treeTypes: string[];
  hint: 'needs' | 'has' | null;
  location: 'needs' | 'has' | null;
  health: 'needs' | 'has' | null;
  intel: 'needs' | 'has' | null;
}

export const DEFAULT_FILTERS: Filters = {
  favorites: false,
  p2p: false,
  f2p: false,
  treeTypes: [],
  hint: null,
  location: null,
  health: null,
  intel: null,
};

interface Props {
  sortMode: SortMode;
  setSortMode: (mode: SortMode) => void;
  sortAsc: boolean;
  setSortAsc: (asc: boolean) => void;
  filters: Filters;
  setFilters: (filters: Filters) => void;
}

const SORT_BUTTONS: { mode: SortMode; label: string }[] = [
  { mode: 'world', label: 'W#' },
  { mode: 'soonest', label: 'Soonest/Latest' },
  { mode: 'fav', label: 'Favorite' },
  { mode: 'health', label: 'Health' },
];

const COMPACT_STORAGE_KEY = 'evilTree_sortFilter_compact';

function loadCompactPreference(): boolean {
  try {
    const raw = localStorage.getItem(COMPACT_STORAGE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export function SortFilterBar({ sortMode, setSortMode, sortAsc, setSortAsc, filters, setFilters }: Props) {
  const [isCompact, setIsCompact] = useState(loadCompactPreference);

  useEffect(() => {
    try {
      localStorage.setItem(COMPACT_STORAGE_KEY, isCompact ? '1' : '0');
    } catch { /* ignore */ }
  }, [isCompact]);

  const handleSortClick = (mode: SortMode) => {
    if (mode === sortMode) {
      setSortAsc(!sortAsc);
    } else {
      setSortMode(mode);
      setSortAsc(true);
    }
  };

  const toggleFilter = (key: 'favorites' | 'p2p' | 'f2p') => {
    const next = { ...filters };
    next[key] = !next[key];
    // "P2P" and "F2P" are mutually exclusive
    if (key === 'p2p' && next.p2p) next.f2p = false;
    if (key === 'f2p' && next.f2p) next.p2p = false;
    setFilters(next);
  };

  const cycleTriState = (key: 'hint' | 'location' | 'health' | 'intel') => {
    const current = filters[key];
    const next = current === null ? 'needs' : current === 'needs' ? 'has' : null;
    setFilters({ ...filters, [key]: next });
  };

  const toggleTreeType = (key: string) => {
    const types = filters.treeTypes.includes(key)
      ? filters.treeTypes.filter(t => t !== key)
      : [...filters.treeTypes, key];
    setFilters({ ...filters, treeTypes: types });
  };

  const arrow = sortAsc ? '\u00A0▲' : '\u00A0▼';
  const sortSummaryLabel = sortMode === 'soonest'
    ? (sortAsc ? 'Soonest' : 'Latest')
    : `${SORT_BUTTONS.find(s => s.mode === sortMode)?.label ?? sortMode}${arrow}`;
  const activeSummary: { label: string; className: string }[] = [];

  if (filters.favorites) activeSummary.push({ label: 'Favorite', className: 'bg-blue-700 text-white font-semibold' });
  if (filters.p2p) activeSummary.push({ label: 'P2P', className: 'bg-blue-700 text-white font-semibold' });
  if (filters.f2p) activeSummary.push({ label: 'F2P', className: 'bg-blue-700 text-white font-semibold' });
  if (filters.treeTypes.length > 0) {
    const typeLabels = FILTERABLE_TREE_TYPES
      .filter((treeType) => filters.treeTypes.includes(treeType.key))
      .map((treeType) => treeType.label);
    const treeLabel = typeLabels.length > 1 ? 'Trees' : 'Tree';
    activeSummary.push({ label: `${treeLabel}: ${typeLabels.join(', ')}`, className: 'bg-blue-700 text-white font-semibold' });
  }
  if (filters.intel) activeSummary.push({
    label: `${filters.intel === 'needs' ? 'Needs' : 'Has'} intel`,
    className: filters.intel === 'needs'
      ? 'bg-amber-500/30 text-amber-200 font-semibold ring-1 ring-amber-500'
      : 'bg-emerald-500/30 text-emerald-200 font-semibold ring-1 ring-emerald-500',
  });
  if (filters.hint) activeSummary.push({
    label: `${filters.hint === 'needs' ? 'Needs' : 'Has'} hint`,
    className: filters.hint === 'needs'
      ? 'bg-amber-500/30 text-amber-200 font-semibold ring-1 ring-amber-500'
      : 'bg-emerald-500/30 text-emerald-200 font-semibold ring-1 ring-emerald-500',
  });
  if (filters.location) activeSummary.push({
    label: `${filters.location === 'needs' ? 'Needs' : 'Has'} location`,
    className: filters.location === 'needs'
      ? 'bg-amber-500/30 text-amber-200 font-semibold ring-1 ring-amber-500'
      : 'bg-emerald-500/30 text-emerald-200 font-semibold ring-1 ring-emerald-500',
  });
  if (filters.health) activeSummary.push({
    label: `${filters.health === 'needs' ? 'Needs' : 'Has'} health`,
    className: filters.health === 'needs'
      ? 'bg-amber-500/30 text-amber-200 font-semibold ring-1 ring-amber-500'
      : 'bg-emerald-500/30 text-emerald-200 font-semibold ring-1 ring-emerald-500',
  });

  if (isCompact) {
    return (
      <div className="relative flex items-start gap-2 px-2 py-1 pr-8 sm:pr-24 bg-gray-800 rounded flex-shrink-0">
        <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
          <button
            onClick={() => setIsCompact(false)}
            className="px-2 py-0.5 text-xs rounded bg-amber-700 text-white font-semibold hover:bg-amber-600 transition-colors"
          >
            Sort: {sortSummaryLabel}
          </button>
          {activeSummary.length > 0 ? activeSummary.map(({ label, className }) => (
            <button
              key={label}
              onClick={() => setIsCompact(false)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${className}`}
            >
              {label}
            </button>
          )) : (
            <button
              onClick={() => setIsCompact(false)}
              className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-400 hover:bg-gray-600 transition-colors"
            >
              No active filters
            </button>
          )}
        </div>
        <button
          onClick={() => setIsCompact(false)}
          aria-label="Expand sort and filter controls"
          title="Expand"
          className="absolute top-1 right-1 py-1 sm:py-0.5 px-3 -mx-3 sm:px-0 sm:mx-0 text-xs sm:text-[11px] text-gray-400 hover:text-gray-200 transition-colors shrink-0"
        >
          <span className="hidden sm:inline">Expand </span>▼
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-2 py-1 pr-8 sm:pr-24 bg-gray-800 rounded flex-shrink-0 sm:flex-wrap">
      {/* Sort buttons */}
      <div className="flex items-start sm:items-center gap-0.5 min-w-0 w-full sm:w-auto">
        <span className="py-1 sm:py-0.5 text-xs sm:text-[11px] text-gray-500 shrink-0 w-9 sm:w-auto sm:mr-1">Sort</span>
        <div className="flex flex-wrap gap-0.5 min-w-0 flex-1 sm:flex-none">
          {SORT_BUTTONS.map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => handleSortClick(mode)}
              className={`px-2 py-1 sm:px-1.5 sm:py-0.5 text-xs sm:text-[11px] rounded transition-colors text-center ${
                sortMode === mode
                  ? 'bg-amber-700 text-white font-semibold'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {mode === 'soonest' && sortMode === 'soonest'
                ? (sortAsc ? 'Soonest' : 'Latest')
                : `${label}${sortMode === mode ? arrow : ''}`}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-600 hidden sm:block" />

      {/* Filter chips */}
      <div className="flex items-start sm:items-center gap-0.5 min-w-0 w-full sm:w-auto">
        <span className="py-1 sm:py-0.5 text-xs sm:text-[11px] text-gray-500 shrink-0 w-9 sm:w-auto sm:mr-1">Filter</span>
        <div className="flex flex-wrap gap-0.5 min-w-0 flex-1 sm:flex-none">
          <FilterChip label="Favorite" active={filters.favorites} onClick={() => toggleFilter('favorites')} />
          <FilterChip label="P2P" active={filters.p2p} onClick={() => toggleFilter('p2p')} />
          <FilterChip label="F2P" active={filters.f2p} onClick={() => toggleFilter('f2p')} />
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-600 hidden sm:block" />

      {/* Tree type filter chips */}
      <div className="flex items-start sm:items-center gap-0.5 min-w-0 w-full sm:w-auto">
        <span className="py-1 sm:py-0.5 text-xs sm:text-[11px] text-gray-500 shrink-0 w-9 sm:w-auto sm:mr-1">Tree</span>
        <div className="flex flex-wrap gap-0.5 min-w-0 flex-1 sm:flex-none">
          {FILTERABLE_TREE_TYPES.map(({ key, label }) => (
            <FilterChip
              key={key}
              label={label}
              active={filters.treeTypes.includes(key)}
              onClick={() => toggleTreeType(key)}
            />
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-600 hidden sm:block" />

      {/* Tri-state info filter chips */}
      <div className="flex items-start sm:items-center gap-0.5 min-w-0 w-full sm:w-auto">
        <span className="py-1 sm:py-0.5 text-xs sm:text-[11px] text-gray-500 shrink-0 w-9 sm:w-auto sm:mr-1">Info</span>
        <div className="flex flex-wrap gap-0.5 min-w-0 flex-1 sm:flex-none">
          <TriStateChip label="Intel" state={filters.intel} onClick={() => cycleTriState('intel')} />
          <TriStateChip label="Hint" state={filters.hint} onClick={() => cycleTriState('hint')} />
          <TriStateChip label="Location" state={filters.location} onClick={() => cycleTriState('location')} />
          <TriStateChip label="Health" state={filters.health} onClick={() => cycleTriState('health')} />
        </div>
      </div>

      <button
        onClick={() => setIsCompact(true)}
        aria-label="Collapse sort and filter controls"
        title="Collapse"
        className="absolute top-1 right-1 py-1 sm:py-0.5 px-3 -mx-3 sm:px-0 sm:mx-0 text-xs sm:text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span className="hidden sm:inline">Collapse </span>▲
      </button>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 sm:px-1.5 sm:py-0.5 text-xs sm:text-[11px] rounded transition-colors text-center ${
        active
          ? 'bg-blue-700 text-white font-semibold'
          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

function TriStateChip({
  label,
  state,
  onClick,
}: {
  label: string;
  state: 'needs' | 'has' | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 sm:px-1.5 sm:py-0.5 text-xs sm:text-[11px] rounded transition-colors text-center ${
        state === 'needs'
          ? 'bg-amber-500/30 text-amber-200 font-semibold ring-1 ring-amber-500'
          : state === 'has'
            ? 'bg-emerald-500/30 text-emerald-200 font-semibold ring-1 ring-emerald-500'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`}
    >
      {state && `${state[0].toUpperCase() + state.slice(1)} `}
      {label}
    </button>
  );
}
