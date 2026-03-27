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
