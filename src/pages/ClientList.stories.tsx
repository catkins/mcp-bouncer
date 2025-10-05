import type { Meta, StoryObj } from '@storybook/react';
import { ClientList } from './ClientList';

const meta: Meta<typeof ClientList> = {
  title: 'Pages/ClientList',
  component: ClientList,
};

export default meta;

export type Story = StoryObj<typeof ClientList>;

const nowIso = new Date().toISOString();

export const Empty: Story = {
  args: {
    clients: [],
  },
};

export const Single: Story = {
  args: {
    clients: [
      { id: '1', name: 'Example Client', version: '1.0.0', title: 'Sample', connected_at: nowIso },
    ],
  },
};

export const Multiple: Story = {
  args: {
    clients: [
      { id: '1', name: 'Build Agent', version: '2.3.1', connected_at: nowIso },
      { id: '2', name: 'Browser MCP', version: '0.7.0', title: 'Chromium', connected_at: nowIso },
      {
        id: '3',
        name: 'Docs Helper',
        version: '2025.08.18',
        title: 'Internal',
        connected_at: nowIso,
      },
    ],
  },
};
