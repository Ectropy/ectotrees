import type { Meta, StoryObj } from '@storybook/react-vite';
import { OgImage } from './OgImage';

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
  render: () => {
    const now = Date.now();
    return (
      <OgImage
        wordmark="Ectotrees"
        tagline="Real time Evil Tree tracker for RS3"
        mapView={{ center: [3450, 2943], zoom: 0 }}
        card={{
          world: { id: 104, type: 'P2P' },
          state: {
            treeStatus: 'mature',
            treeType: 'elder',
            treeHealth: 45,
            treeSetAt: now - 17 * 60 * 1000,
            matureAt: now - 12 * 60 * 1000,
            treeHint: 'Close to a mine on the outskirts of a city',
            treeExactLocation: 'West of Falador',
          },
          isFavorite: false,
          isHidden: false,
          effectsLightning: false,
          effectsSparks: false,
          canEdit: true,
          onToggleFavorite: () => {},
          onToggleHidden: () => {},
          onCardClick: () => {},
          onOpenTool: () => {},
        }}
      />
    );
  },
};
