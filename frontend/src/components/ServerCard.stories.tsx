import type { Meta, StoryObj } from '@storybook/react';
import { ServerCard } from './ServerCard';
import type { MCPServerConfig, ClientStatus } from '../tauri/bridge';
import { TransportType } from '../tauri/bridge';

// Mock server configs using class constructors
const mockServerConfig: MCPServerConfig = {
  name: 'fetch',
  description: 'fetch things',
  command: 'uvx',
  args: ['mcp-server-fetch'],
  transport: TransportType.TransportStdio,
  enabled: true,
  env: {
    API_KEY: 'your-api-key',
    DEBUG: 'true',
  },
};

const mockConnectedStatus: ClientStatus = {
  name: 'fetch',
  connected: true,
  tools: 11,
  last_error: undefined,
  authorization_required: false,
  oauth_authenticated: false,
};

const mockDisconnectedStatus: ClientStatus = {
  name: 'fetch',
  connected: false,
  tools: 0,
  last_error: 'Connection timeout',
  authorization_required: false,
  oauth_authenticated: false,
};

const mockAuthRequiredStatus: ClientStatus = {
  name: 'fetch',
  connected: false,
  tools: 0,
  last_error: undefined,
  authorization_required: true,
  oauth_authenticated: false,
};

const meta: Meta<typeof ServerCard> = {
  title: 'Components/ServerCard',
  component: ServerCard,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light-gray',
      values: [
        { name: 'light-gray', value: '#f3f4f6' },
        { name: 'dark-gray', value: '#1f2937' },
      ],
    },
  },
  tags: ['autodocs'],
  args: {
    server: mockServerConfig,
    loading: false,
    toggleLoading: false,
    restartLoading: false,
  },
  argTypes: {
    onEdit: { action: 'edited' },
    onRemove: { action: 'removed' },
    onToggle: { action: 'toggled' },
    onRestart: { action: 'restarted' },
    onRefreshStatus: { action: 'refreshStatus' },
    onOpenTools: { action: 'openTools' },
    onAuthorize: { action: 'authorize' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  args: {
    clientStatus: mockConnectedStatus,
  },
};

export const Disconnected: Story = {
  args: {
    clientStatus: mockDisconnectedStatus,
  },
};

export const AuthorizationRequired: Story = {
  args: {
    clientStatus: mockAuthRequiredStatus,
  },
};

export const Loading: Story = {
  args: {
    clientStatus: mockConnectedStatus,
    loading: true,
  },
};

export const ToggleLoading: Story = {
  args: {
    clientStatus: mockConnectedStatus,
    toggleLoading: true,
  },
};

export const RestartLoading: Story = {
  args: {
    clientStatus: mockConnectedStatus,
    restartLoading: true,
  },
};

export const DisabledServer: Story = {
  args: {
    server: {
      ...mockServerConfig,
      enabled: false,
    },
    clientStatus: {
      ...mockDisconnectedStatus,
      connected: false,
    },
  },
};

export const HttpServer: Story = {
  args: {
    server: {
      name: 'buildkite',
      description: 'CI/CD pipeline integration',
      transport: TransportType.TransportStreamableHTTP,
      endpoint: 'http://localhost:7700/mcp',
      enabled: true,
      command: '',
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
    },
    clientStatus: {
      name: 'buildkite',
      connected: true,
      tools: 27,
      authorization_required: false,
      oauth_authenticated: false,
    },
  },
};

export const SseServer: Story = {
  args: {
    server: {
      name: 'Context7',
      description: 'SSE server for real-time updates',
      transport: TransportType.TransportSSE,
      endpoint: 'https://mcp.context7.com/sse',
      enabled: true,
      command: '',
    },
    clientStatus: {
      name: 'Context7',
      connected: true,
      tools: 2,
      authorization_required: false,
      oauth_authenticated: true,
    },
  },
};

export const WithToggleError: Story = {
  args: {
    clientStatus: mockDisconnectedStatus,
    toggleError: 'Failed to enable server: Connection refused',
  },
};
