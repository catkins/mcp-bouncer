import type { Meta, StoryObj } from '@storybook/react';
import { ClientCard } from './ClientCard';

const meta: Meta<typeof ClientCard> = {
  title: 'Components/ClientCard',
  component: ClientCard,
};

export default meta;

export type Story = StoryObj<typeof ClientCard>;

export const WithTitle: Story = {
  args: {
    client: {
      id: '1',
      name: 'Example Client',
      version: '1.2.3',
      title: 'Sample Title',
      connected_at: new Date().toISOString(),
    },
  },
};

export const NoTitle: Story = {
  args: {
    client: {
      id: '2',
      name: 'NoTitle',
      version: '0.1.0',
      connected_at: new Date().toISOString(),
    },
  },
};

export const LongNames: Story = {
  args: {
    client: {
      id: '3',
      name: 'Very Very Long Client Name That Should Still Render Well In The Card',
      version: '2025.08.18',
      title: 'A Very Descriptive Optional Title That Might Span Multiple Words',
      connected_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    },
  },
};
