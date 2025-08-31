import type { Meta, StoryObj } from '@storybook/react';
import { TabSwitcher } from './TabSwitcher';

const meta: Meta<typeof TabSwitcher> = {
  title: 'Components/TabSwitcher',
  component: TabSwitcher,
};

export default meta;

export type Story = StoryObj<typeof TabSwitcher>;

export const Default: Story = {
  args: {
    value: 'servers',
    onChange: () => {},
    serverCount: 5,
    clientCount: 10,
  },
};

export const ClientsActive: Story = {
  args: {
    value: 'clients',
    onChange: () => {},
    serverCount: 2,
    clientCount: 8,
  },
};
