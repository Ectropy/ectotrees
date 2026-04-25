export interface LocationHint {
  hint: string;
  locations: string[];
}

export const LOCATION_HINTS: LocationHint[] = [
  {
    hint: 'Close to a collection of yew trees',
    locations: ["South of Seers' Village flax field by the yew trees"],
  },
  {
    hint: 'Close to a dungeon entrance, and within a tropical jungle',
    locations: ['Ape Atoll, near the entrance to Ape Atoll Dungeon', 'Near the entrance of the Brimhaven Dungeon'],
  },
  {
    hint: 'Close to a large collection of willow trees',
    locations: [
      "Northwest of Seers' Village bank",
      'South of Draynor Village, near the willow trees',
      "South of Legends' Guild",
      "Southwest part of Tree Gnome Stronghold, north of Brimstail's cave and east of the bridge",
    ],
  },
  {
    hint: 'Close to a mine on the outskirts of a city',
    locations: ["South of Legends' Guild", 'West of Falador'],
  },
  {
    hint: 'Close to a Runecrafting altar',
    locations: [
      'Near the body altar, south of the Edgeville Monastery',
      'Southwest of mining spot near the nature altar, northwest of Shilo Village',
    ],
  },
  {
    hint: "Close to the home of 'Legends'",
    locations: ["North of Legends' Guild", "South of Legends' Guild"],
  },
  {
    hint: 'Close to the town you call Yanille',
    locations: ['Northeast of Yanille', 'South of Tree Gnome Village and northwest of Yanille'],
  },
  {
    hint: "Close to the village you call 'Seers'",
    locations: ["Inside McGrubor's Wood", "Northwest of Seers' Village bank", "South of Seers' Village flax field by the yew trees"],
  },
  {
    hint: "Close to the village you humans call 'Draynor'",
    locations: ['North of Draynor Village, near Draynor Manor', 'South of Draynor Village, near the willow trees'],
  },
  {
    hint: 'Due west of the town you call Lumbridge',
    locations: ['South of Draynor Village, near the willow trees'],
  },
  {
    hint: 'In a location with rare trees and ogres nearby',
    locations: ['South of Castle Wars, north of the fairy ring BKP', "West of Oo'glog"],
  },
  {
    hint: 'In the lands inhabited by elves',
    locations: ['Northeast of Tyras Camp', 'Lletya, south of the magic trees'],
  },
  {
    hint: 'Just outside of the city you call Varrock',
    locations: ["King's Road, Southeast of Fort Forinthry and above digsite", 'North of Varrock Palace, near the Wilderness wall'],
  },
  {
    hint: "North as the crow flies from Seers' Village",
    locations: ['East of the house portal in Rellekka', "Northwest of Seers' Village bank"],
  },
  {
    hint: 'North as the crow flies from the market of Ardougne',
    locations: ["Inside McGrubor's Wood", 'Southwest of the Ranging Guild'],
  },
  {
    hint: 'On the island known as Karamja',
    locations: ['Kharazi Jungle, east of the teak trees', 'Southwest of mining spot near the nature altar, northwest of Shilo Village'],
  },
  {
    hint: 'On the southern coast of a tropical island',
    locations: ['Ape Atoll, near the entrance to Ape Atoll Dungeon', 'Kharazi Jungle, east of the teak trees'],
  },
  {
    hint: 'To the south of a tree gnome settlement',
    locations: ['South of Tree Gnome Stronghold and east of the Outpost', 'South of Tree Gnome Village and northwest of Yanille'],
  },
  {
    hint: 'South-east of Wendlewick, by the farm',
    locations: ['East of the Marigold Farm on Havenhythe'],
  }
];

// Game (x, y) coordinates for each unique spawn location. Sourced from the
// RuneScape Wiki's Evil Tree page (https://runescape.wiki/w/Evil_Tree), which
// uses the same RS3 community tile layer (mapID 28) as our MapView.
// Keys MUST exactly match the location strings used in LOCATION_HINTS above —
// the coverage test in src/constants/__tests__/evilTree.test.ts enforces this.
export const LOCATION_COORDS: Record<string, { x: number; y: number }> = {
  "South of Seers' Village flax field by the yew trees": { x: 2757, y: 3429 },
  'Ape Atoll, near the entrance to Ape Atoll Dungeon': { x: 2756, y: 2699 },
  'Near the entrance of the Brimhaven Dungeon': { x: 2737, y: 3159 },
  "Northwest of Seers' Village bank": { x: 2708, y: 3509 },
  'South of Draynor Village, near the willow trees': { x: 3092, y: 3232 },
  "South of Legends' Guild": { x: 2724, y: 3333 },
  "Southwest part of Tree Gnome Stronghold, north of Brimstail's cave and east of the bridge": { x: 2398, y: 3431 },
  'West of Falador': { x: 2925, y: 3375 },
  'Near the body altar, south of the Edgeville Monastery': { x: 3053, y: 3459 },
  'Southwest of mining spot near the nature altar, northwest of Shilo Village': { x: 2833, y: 3020 },
  "North of Legends' Guild": { x: 2720, y: 3413 },
  'Northeast of Yanille': { x: 2606, y: 3121 },
  'South of Tree Gnome Village and northwest of Yanille': { x: 2523, y: 3107 },
  "Inside McGrubor's Wood": { x: 2668, y: 3490 },
  'North of Draynor Village, near Draynor Manor': { x: 3093, y: 3304 },
  'South of Castle Wars, north of the fairy ring BKP': { x: 2371, y: 3055 },
  "West of Oo'glog": { x: 2460, y: 2850 },
  'Northeast of Tyras Camp': { x: 2207, y: 3172 },
  'Lletya, south of the magic trees': { x: 2295, y: 3129 },
  "King's Road, Southeast of Fort Forinthry and above digsite": { x: 3335, y: 3475 },
  'North of Varrock Palace, near the Wilderness wall': { x: 3221, y: 3514 },
  'East of the house portal in Rellekka': { x: 2695, y: 3635 },
  'Southwest of the Ranging Guild': { x: 2653, y: 3412 },
  'Kharazi Jungle, east of the teak trees': { x: 2909, y: 2895 },
  'South of Tree Gnome Stronghold and east of the Outpost': { x: 2450, y: 3348 },
  'East of the Marigold Farm on Havenhythe': { x: 4308, y: 3265 },
};
