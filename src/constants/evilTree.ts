import type { TreeType } from '../../shared/types.ts';
import { LOCATION_HINTS } from '../../shared/hints.ts';

export { TREE_TYPES, SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS } from '../../shared/types.ts';
export type { TreeType } from '../../shared/types.ts';
export { LOCATION_HINTS } from '../../shared/hints.ts';
export type { LocationHint } from '../../shared/hints.ts';

export const TREE_TYPE_LABELS: Record<TreeType, string> = {
  sapling:        'Strange Sapling',
  'sapling-tree': 'Strange Sapling (Tree)',
  'sapling-oak': 'Strange Sapling (Oak)',
  'sapling-willow': 'Strange Sapling (Willow)',
  'sapling-maple': 'Strange Sapling (Maple)',
  'sapling-yew': 'Strange Sapling (Yew)',
  'sapling-magic': 'Strange Sapling (Magic)',
  'sapling-elder': 'Strange Sapling (Elder)',
  mature:  'Mature (unknown)',
  tree:    'Evil Tree (normal)',
  oak:     'Evil Oak',
  willow:  'Evil Willow',
  maple:   'Evil Maple',
  yew:     'Evil Yew',
  magic:   'Evil Magic',
  elder:   'Evil Elder',
};

export const TREE_TYPE_SHORT: Record<TreeType, string> = {
  sapling:        'Sapling (unknown)',
  'sapling-tree': 'Sapling (Tree)',
  'sapling-oak': 'Sapling (Oak)',
  'sapling-willow': 'Sapling (Willow)',
  'sapling-maple': 'Sapling (Maple)',
  'sapling-yew': 'Sapling (Yew)',
  'sapling-magic': 'Sapling (Magic)',
  'sapling-elder': 'Sapling (Elder)',
  mature:  'Mature (unknown)',
  tree:    'Tree (normal)',
  oak:     'Oak',
  willow:  'Willow',
  maple:   'Maple',
  yew:     'Yew',
  magic:   'Magic',
  elder:   'Elder',
};

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


export function locationsForHint(hint: string): string[] {
  return LOCATION_HINTS.find(lh => lh.hint === hint)?.locations ?? [];
}

export function resolveExactLocation(hint: string): string {
  const match = LOCATION_HINTS.find(lh => lh.hint === hint);
  return match?.locations.length === 1 ? match.locations[0] : '';
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
