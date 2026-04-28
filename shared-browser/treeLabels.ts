import type { TreeType } from '../shared/types.ts';

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
