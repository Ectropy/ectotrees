import type { Meta, StoryObj } from '@storybook/react-vite';
import { OgImage } from './OgImage';

const NOW = Date.now();

const meta: Meta<typeof OgImage> = {
  title: 'Marketing/OgImage',
  component: OgImage,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'light' },
  },
};

export default meta;
type Story = StoryObj<typeof OgImage>;

export const Default: Story = {
  args: {
    wordmark: 'Ectotrees',
    tagline: "Real time Evil Tree tracker for RS3.",
    // TODO: pick the framing. Leaflet CRS.Simple uses [y, x] (not [x, y]).
    // The app's default is [3232, 3232] @ zoom 2 (roughly Varrock/Lumbridge).
    // Try panning around in the real MapView story, then hard-code what looks best here.
    mapView: {
      center: [3232, 3232],
      zoom: 2,
    },
    card: {
      "world": {
        "id": 104,
        "type": "P2P"
      },

      state: {
        treeStatus: 'mature',
        treeType: 'elder',
        treeHealth: 50,
        treeSetAt: NOW - 17 * 60 * 1000,
        matureAt: NOW - 12 * 60 * 1000,
        treeHint: 'Close to a mine on the outskirts of a city',
        treeExactLocation: 'West of Falador',
      },

      "isFavorite": false,
      "isHidden": false,
      "effectsLightning": false,
      "effectsSparks": false,
      "canEdit": true,
      onToggleFavorite: () => {},
      onToggleHidden: () => {},
      onCardClick: () => {},
      onOpenTool: () => {},
    },
  },
};
