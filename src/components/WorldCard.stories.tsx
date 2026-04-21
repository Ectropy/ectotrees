import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorldCard } from './WorldCard';

const WORLD_P2P = { id: 104, type: 'P2P' as const };
const WORLD_F2P = { id: 3, type: 'F2P' as const };
const NOW = Date.now();

const meta = {
  title: 'Components/WorldCard',
  component: WorldCard,
  parameters: { layout: 'centered' },
  args: {
    world: WORLD_P2P,
    state: { treeStatus: 'none' },
    isFavorite: false,
    isHidden: false,
    onToggleFavorite: () => {},
    onToggleHidden: () => {},
    onCardClick: () => {},
    onOpenTool: () => {},
    effectsLightning: true,
    effectsSparks: true,
    canEdit: true,
  },
} satisfies Meta<typeof WorldCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const None: Story = {};

export const F2P: Story = {
  args: { world: WORLD_F2P },
};

export const SpawnTimer: Story = {
  args: {
    state: {
      treeStatus: 'none',
      nextSpawnTarget: NOW + 28 * 60 * 1000,
      spawnSetAt: NOW - 2 * 60 * 1000,
      treeHint: 'Close to the town you call Yanille',
    },
  },
};

export const Sapling: Story = {
  args: {
    state: {
      treeStatus: 'sapling',
      treeType: 'sapling-yew',
      treeHint: 'Close to the town you call Yanille',
      treeSetAt: NOW - 60 * 1000,
    },
  },
};

export const MatureWithHealth: Story = {
  args: {
    state: {
      treeStatus: 'mature',
      treeType: 'yew',
      treeHint: 'Close to the town you call Yanille',
      treeExactLocation: 'Northeast of Yanille',
      treeHealth: 75,
      treeSetAt: NOW - 6 * 60 * 1000,
      matureAt: NOW - 60 * 1000,
    },
  },
};

export const AliveAt50PercentCap: Story = {
  args: {
    state: {
      treeStatus: 'alive',
      treeType: 'elder',
      treeHint: 'In the lands inhabited by elves',
      treeExactLocation: 'Lletya, south of the magic trees',
      treeHealth: 50,
      treeSetAt: NOW - 16 * 60 * 1000,
      matureAt: NOW - 11 * 60 * 1000,
    },
  },
};

export const AliveAt25PercentCap: Story = {
  args: {
    state: {
      treeStatus: 'alive',
      treeType: 'elder',
      treeHint: 'In the lands inhabited by elves',
      treeExactLocation: 'Lletya, south of the magic trees',
      treeHealth: 25,
      treeSetAt: NOW - 26 * 60 * 1000,
      matureAt: NOW - 21 * 60 * 1000,
    },
  },
};

export const Dead: Story = {
  args: {
    state: {
      treeStatus: 'dead',
      treeType: 'elder',
      treeHint: 'In the lands inhabited by elves',
      deadAt: NOW - 2 * 60 * 1000,
    },
    effectsSparks: true,
  },
};

export const DeadRewardWindowExpiring: Story = {
  args: {
    state: {
      treeStatus: 'dead',
      treeType: 'magic',
      treeHint: 'On the island known as Karamja',
      deadAt: NOW - 9 * 60 * 1000,
    },
  },
};

export const LightningFiring: Story = {
  args: {
    state: {
      treeStatus: 'alive',
      treeType: 'yew',
      treeHint: "Close to a collection of yew trees",
      treeExactLocation: "South of Seers' Village flax field by the yew trees",
      matureAt: NOW - 10 * 60 * 1000,
      treeHealth: 50,
    },
    lightningEvent: { kind: 'lightning1', seq: 1 },
    onDismissLightning: () => {},
  },
};

export const Favorite: Story = {
  args: { isFavorite: true },
};

export const Hidden: Story = {
  args: { isHidden: true },
};

export const ActiveWorld: Story = {
  args: {
    isActiveWorld: true,
    state: {
      treeStatus: 'mature',
      treeType: 'oak',
      treeHint: 'Just outside of the city you call Varrock',
      treeExactLocation: 'North of Varrock Palace, near the Wilderness wall',
      matureAt: NOW - 5 * 60 * 1000,
      treeHealth: 80,
    },
  },
};

export const ReadOnly: Story = {
  args: {
    canEdit: false,
    state: {
      treeStatus: 'mature',
      treeType: 'willow',
      treeHint: 'Close to a large collection of willow trees',
      treeExactLocation: 'South of Draynor Village, near the willow trees',
      treeHealth: 60,
      matureAt: NOW - 8 * 60 * 1000,
    },
  },
};

export const RecentOwnSubmission: Story = {
  args: {
    isRecentOwnSubmission: true,
    state: {
      treeStatus: 'mature',
      treeType: 'maple',
      treeHint: 'North as the crow flies from the market of Ardougne',
      treeExactLocation: 'Southwest of the Ranging Guild',
      treeHealth: 90,
      matureAt: NOW - 3 * 60 * 1000,
    },
  },
};
