import type { Meta, StoryObj } from '@storybook/react-vite';
import { UpdateBanner } from './UpdateBanner';

const meta: Meta<typeof UpdateBanner> = {
  title: 'Components/UpdateBanner',
  component: UpdateBanner,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof UpdateBanner>;

export const UpdateAvailable: Story = {
  args: { defaultVisible: true },
};
