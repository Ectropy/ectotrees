import { LOCATION_HINTS, LOCATION_COORDS } from '../../shared/hints.ts';

export { TREE_TYPES, SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS } from '../../shared/types.ts';
export type { TreeType } from '../../shared/types.ts';
export {
  LOCATION_HINTS,
  LOCATION_COORDS,
  hintForLocation,
  locationsForHint,
  resolveExactLocation,
} from '../../shared/hints.ts';
export type { LocationHint } from '../../shared/hints.ts';
export { TREE_TYPE_LABELS, TREE_TYPE_SHORT } from '../../shared-browser/treeLabels.ts';

export const FILTERABLE_TREE_TYPES = [
  { key: 'unknown', label: 'Unknown' },
  { key: 'sapling', label: 'Sapling' },
  { key: 'tree',    label: 'Tree' },
  { key: 'oak',     label: 'Oak' },
  { key: 'willow',  label: 'Willow' },
  { key: 'maple',   label: 'Maple' },
  { key: 'yew',     label: 'Yew' },
  { key: 'magic',   label: 'Magic' },
  { key: 'elder',   label: 'Elder' },
] as const;


export function hintsForLocation(location: string): string[] {
  return LOCATION_HINTS.filter(lh => lh.locations.includes(location)).map(lh => lh.hint);
}

export function coordsForLocation(location: string): { x: number; y: number } | undefined {
  return LOCATION_COORDS[location];
}

export function formatMs(ms: number): string {
  if (ms <= 0) return '0m';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
