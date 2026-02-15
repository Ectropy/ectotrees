export const TREE_TYPES = [
  'sapling',
  'mature',
  'tree',
  'oak',
  'willow',
  'maple',
  'yew',
  'magic',
  'elder',
] as const;

export type TreeType = (typeof TREE_TYPES)[number];

export const TREE_TYPE_LABELS: Record<TreeType, string> = {
  sapling: 'Strange Sapling',
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
  sapling: 'Strange Sapling',
  mature:  'Mature (unknown)',
  tree:    'Tree (normal)',
  oak:     'Oak',
  willow:  'Willow',
  maple:   'Maple',
  yew:     'Yew',
  magic:   'Magic',
  elder:   'Elder',
};

export interface LocationHint {
  hint: string;
  locations: string[];
}

export const LOCATION_HINTS: LocationHint[] = [
  {
    hint: 'Close to a collection of yew trees',
    locations: ["South of Seers' Village flax field"],
  },
  {
    hint: 'Close to a dungeon entrance, tropical jungle',
    locations: ['Ape Atoll', 'Brimhaven Dungeon'],
  },
  {
    hint: 'Close to large willow collection',
    locations: [
      "Northwest Seers' Village bank",
      'South Draynor Village',
      "South Legends' Guild",
      'Southwest Tree Gnome Stronghold',
    ],
  },
  {
    hint: 'Close to mine on city outskirts',
    locations: ["South Legends' Guild", 'West Falador'],
  },
  {
    hint: 'Close to Runecrafting altar',
    locations: [
      'Near body altar south Edgeville Monastery',
      'Southwest nature altar mining spot',
    ],
  },
  {
    hint: "Close to Legends' home",
    locations: ["North Legends' Guild", "South Legends' Guild"],
  },
  {
    hint: 'Close to Yanille',
    locations: ['Northeast Yanille', 'South Tree Gnome Village'],
  },
  {
    hint: "Close to Seers' Village",
    locations: ["Inside McGrubor's Wood", 'Northwest bank', 'South flax field'],
  },
  {
    hint: 'Close to Draynor',
    locations: ['North near Draynor Manor', 'South near willows'],
  },
  {
    hint: 'Due west of Lumbridge',
    locations: ['South Draynor near willows'],
  },
  {
    hint: 'Rare trees with ogres nearby',
    locations: ['South Castle Wars', "West Oo'glog"],
  },
  {
    hint: 'Lands inhabited by elves',
    locations: ['Northeast Tyras Camp', 'Lletya south magic trees'],
  },
  {
    hint: 'Just outside Varrock',
    locations: ["King's Road southeast lumber yard", 'North Varrock Palace'],
  },
  {
    hint: "North from Seers' Village",
    locations: ['East Rellekka house portal', 'Northwest bank'],
  },
  {
    hint: 'North from Ardougne market',
    locations: ["Inside McGrubor's Wood", 'Southwest Ranging Guild'],
  },
  {
    hint: 'On Karamja island',
    locations: ['East Kharazi Jungle teaks', 'Southwest nature altar mining spot'],
  },
  {
    hint: 'Southern tropical island coast',
    locations: ['Ape Atoll dungeon entrance', 'East Kharazi Jungle teaks'],
  },
  {
    hint: 'South of tree gnome settlement',
    locations: ['South Tree Gnome Stronghold', 'South Tree Gnome Village'],
  },
];

export const SAPLING_MATURE_MS  = 5 * 60 * 1000;
export const ALIVE_DEAD_MS      = 30 * 60 * 1000;
export const DEAD_CLEAR_MS      = 10 * 60 * 1000;

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
