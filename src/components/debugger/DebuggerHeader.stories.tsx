import type { Meta, StoryObj } from '@storybook/react';
import { DebuggerHeader } from './DebuggerHeader';
import type { ClientStatus } from '../../tauri/bridge';

const connectedStatus: ClientStatus = {
  name: 'server-alpha',
  state: 'connected',
  tools: 3,
  authorization_required: false,
  oauth_authenticated: false,
};

const meta: Meta<typeof DebuggerHeader> = {
  title: 'Components/Debugger/DebuggerHeader',
  component: DebuggerHeader,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    selectedServer: 'server-alpha',
    serverOptions: [
      { name: 'server-alpha', description: 'Primary server' },
      { name: 'server-beta', description: 'Secondary server' },
    ],
    status: connectedStatus,
    serverEligible: true,
  },
  argTypes: {
    onSelectServer: { action: 'select-server' },
    status: {
      control: { type: 'object' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const Connecting: Story = {
  args: {
    status: {
      ...connectedStatus,
      state: 'connecting',
      tools: 0,
    },
  },
};

export const Disconnected: Story = {
  args: {
    status: {
      ...connectedStatus,
      state: 'disconnected',
    },
    serverEligible: false,
  },
};

export const NoSelection: Story = {
  args: {
    selectedServer: null,
  },
  render: ({ status: _status, ...rest }) => <DebuggerHeader {...rest} />, 
};
