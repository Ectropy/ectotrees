import { FILTERABLE_TREE_TYPES } from '../constants/evilTree';

export type SortMode = 'world' | 'active' | 'spawn' | 'ending' | 'fav' | 'health';

export interface Filters {
  favorites: boolean;
  active: boolean;
  noData: boolean;
  p2p: boolean;
  f2p: boolean;
  treeTypes: string[];
}

export const DEFAULT_FILTERS: Filters = {
  favorites: false,
  active: false,
  noData: false,
  p2p: false,
  f2p: false,
  treeTypes: [],
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
  { mode: 'active', label: 'Active' },
  { mode: 'spawn', label: 'Spawn' },
  { mode: 'ending', label: 'Ending' },
  { mode: 'fav', label: 'Favorite' },
  { mode: 'health', label: 'Health' },
];

export function SortFilterBar({ sortMode, setSortMode, sortAsc, setSortAsc, filters, setFilters }: Props) {
  const handleSortClick = (mode: SortMode) => {
    if (mode === sortMode) {
      // Health acts as a filter too — 3rd click deselects: asc → desc → off
      if (mode === 'health' && !sortAsc) {
        setSortMode('world');
        setSortAsc(true);
      } else {
        setSortAsc(!sortAsc);
      }
    } else {
      setSortMode(mode);
      setSortAsc(true);
    }
  };

  const toggleFilter = (key: 'favorites' | 'active' | 'noData' | 'p2p' | 'f2p') => {
    const next = { ...filters };
    next[key] = !next[key];
    // "Active" and "No data" are mutually exclusive
    if (key === 'active' && next.active) next.noData = false;
    if (key === 'noData' && next.noData) next.active = false;
    // "P2P" and "F2P" are mutually exclusive
    if (key === 'p2p' && next.p2p) next.f2p = false;
    if (key === 'f2p' && next.f2p) next.p2p = false;
    setFilters(next);
  };

  const toggleTreeType = (key: string) => {
    const types = filters.treeTypes.includes(key)
      ? filters.treeTypes.filter(t => t !== key)
      : [...filters.treeTypes, key];
    setFilters({ ...filters, treeTypes: types });
  };

  const arrow = sortAsc ? '\u00A0▲' : '\u00A0▼';

  return (
    <div className="flex items-center gap-3 px-2 py-1 bg-gray-800 rounded flex-shrink-0 flex-wrap">
      {/* Sort buttons */}
      <div className="flex items-center gap-0.5">
        <span className="text-[10px] text-gray-500 mr-1">Sort</span>
        {SORT_BUTTONS.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => handleSortClick(mode)}
            className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
              sortMode === mode
                ? 'bg-amber-700 text-white font-semibold'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {label}{sortMode === mode ? arrow : ''}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-600 hidden min-[520px]:block" />

      {/* Filter chips */}
      <div className="flex items-center gap-0.5">
        <span className="text-[10px] text-gray-500 mr-1">Filter</span>
        <FilterChip label="Favorite" active={filters.favorites} onClick={() => toggleFilter('favorites')} />
        <FilterChip label="Active" active={filters.active} onClick={() => toggleFilter('active')} />
        <FilterChip label="No data" active={filters.noData} onClick={() => toggleFilter('noData')} />
        <FilterChip label="P2P" active={filters.p2p} onClick={() => toggleFilter('p2p')} />
        <FilterChip label="F2P" active={filters.f2p} onClick={() => toggleFilter('f2p')} />
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-gray-600 hidden min-[520px]:block" />

      {/* Tree type filter chips */}
      <div className="flex items-center gap-0.5">
        <span className="text-[10px] text-gray-500 mr-1">Tree</span>
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
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
        active
          ? 'bg-blue-700 text-white font-semibold'
          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}
