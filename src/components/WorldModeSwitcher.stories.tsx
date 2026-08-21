import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorldModeSwitcher } from './WorldModeSwitcher';

const meta: Meta<typeof WorldModeSwitcher> = {
  title: 'Components/WorldModeSwitcher',
  component: WorldModeSwitcher,
  parameters: { layout: 'centered' },
  args: { leaguesCount: 68, seen: true, setMode: () => {} },
};

export default meta;
type Story = StoryObj<typeof WorldModeSwitcher>;

export const MainSelected: Story = {
  args: { mode: 'main' },
};

export const LeaguesSelected: Story = {
  args: { mode: 'leagues' },
};

/** Before the user's first visit to Leagues — the attention dot pulses. */
export const Unseen: Story = {
  args: { mode: 'main', seen: false },
};

/** No Leagues worlds configured (pre-launch, or after the event ends) — renders nothing. */
export const NoLeaguesWorlds: Story = {
  args: { mode: 'main', leaguesCount: 0, seen: false },
};
