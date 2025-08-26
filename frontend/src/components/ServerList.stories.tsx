import type { Meta, StoryObj } from '@storybook/react';
import { ServerList } from './ServerList';
import {
  MCPServerConfig,
  TransportType,
} from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/settings/models';
import { ClientStatus } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/mcp/models';

// Mock server configurations
const mockServers = [
  new MCPServerConfig({
    name: 'fetch',
    description: 'Fetch things from the web',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    transport: TransportType.TransportStdio,
    enabled: true,
    env: {
      API_KEY: 'your-api-key',
    },
  }),
  new MCPServerConfig({
    name: 'buildkite',
    description: 'CI/CD pipeline integration',
    transport: TransportType.TransportStreamableHTTP,
    endpoint: 'http://localhost:7700/mcp',
    enabled: true,
    command: '',
    headers: {
      Authorization: 'Bearer token123',
    },
  }),
  new MCPServerConfig({
    name: 'disabled-server',
    description: 'A server that is currently disabled',
    command: 'python',
    args: ['-m', 'server'],
    transport: TransportType.TransportStdio,
    enabled: false,
    env: {},
  }),
];

// Mock client status
const mockClientStatus = {
  fetch: new ClientStatus({
    name: 'fetch',
    connected: true,
    tools: 11,
    last_error: undefined,
    authorization_required: false,
    oauth_authenticated: false,
  }),
  buildkite: new ClientStatus({
    name: 'buildkite',
    connected: true,
    tools: 27,
    last_error: undefined,
    authorization_required: false,
    oauth_authenticated: false,
  }),
  'disabled-server': new ClientStatus({
    name: 'disabled-server',
    connected: false,
    tools: 0,
    last_error: undefined,
    authorization_required: false,
    oauth_authenticated: false,
  }),
};

const mockClientStatusWithErrors = {
  fetch: new ClientStatus({
    name: 'fetch',
    connected: false,
    tools: 0,
    last_error: 'Connection timeout',
    authorization_required: false,
    oauth_authenticated: false,
  }),
  buildkite: new ClientStatus({
    name: 'buildkite',
    connected: false,
    tools: 0,
    last_error: 'Authentication failed',
    authorization_required: true,
    oauth_authenticated: false,
  }),
  'disabled-server': new ClientStatus({
    name: 'disabled-server',
    connected: false,
    tools: 0,
    last_error: undefined,
    authorization_required: false,
    oauth_authenticated: false,
  }),
};

const mockLoadingStates = {
  addServer: false,
  updateServer: false,
  removeServer: false,
  general: false,
  toggleServer: {},
  restartServer: {},
};

const mockErrors = {
  toggleServer: {},
};

const meta: Meta<typeof ServerList> = {
  title: 'Components/ServerList',
  component: ServerList,
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'light-gray',
      values: [
        { name: 'light-gray', value: '#f9fafb' },
        { name: 'dark-gray', value: '#111827' },
      ],
    },
  },
  tags: ['autodocs'],
  args: {
    servers: mockServers,
    clientStatus: mockClientStatus,
    loadingStates: mockLoadingStates,
    errors: mockErrors,
  },
  argTypes: {
    onAddServer: { action: 'addServer' },
    onUpdateServer: { action: 'updateServer' },
    onRemoveServer: { action: 'removeServer' },
    onToggleServer: { action: 'toggleServer' },
    onRestartServer: { action: 'restartServer' },
    onRefreshStatus: { action: 'refreshStatus' },
    onAuthorizeServer: { action: 'authorizeServer' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EmptyList: Story = {
  args: {
    servers: [],
    clientStatus: {},
  },
};

export const SingleServer: Story = {
  args: {
    servers: [mockServers[0]],
    clientStatus: {
      fetch: mockClientStatus.fetch,
    },
  },
};

export const AllConnected: Story = {
  args: {
    servers: mockServers,
    clientStatus: mockClientStatus,
  },
};

export const WithErrors: Story = {
  args: {
    servers: mockServers,
    clientStatus: mockClientStatusWithErrors,
  },
};

export const LoadingAddServer: Story = {
  args: {
    loadingStates: {
      ...mockLoadingStates,
      addServer: true,
    },
  },
};

export const LoadingToggle: Story = {
  args: {
    loadingStates: {
      ...mockLoadingStates,
      toggleServer: {
        fetch: true,
      },
    },
  },
};

export const LoadingRestart: Story = {
  args: {
    loadingStates: {
      ...mockLoadingStates,
      restartServer: {
        buildkite: true,
      },
    },
  },
};

export const LoadingMultiple: Story = {
  args: {
    loadingStates: {
      ...mockLoadingStates,
      toggleServer: {
        fetch: true,
        buildkite: true,
      },
      restartServer: {
        fetch: true,
      },
    },
  },
};

export const WithToggleErrors: Story = {
  args: {
    errors: {
      ...mockErrors,
      toggleServer: {
        fetch: 'Failed to enable server: Connection refused',
        buildkite: 'Server is already running',
      },
    },
  },
};

export const MixedTransports: Story = {
  args: {
    servers: [
      ...mockServers,
      new MCPServerConfig({
        name: 'sse-server',
        description: 'SSE server for real-time updates',
        transport: TransportType.TransportSSE,
        endpoint: 'https://mcp.example.com/sse',
        enabled: true,
        command: '',
      }),
    ],
    clientStatus: {
      ...mockClientStatus,
      'sse-server': new ClientStatus({
        name: 'sse-server',
        connected: true,
        tools: 5,
        authorization_required: false,
        oauth_authenticated: true,
      }),
    },
  },
};

export const AuthenticationRequired: Story = {
  args: {
    servers: mockServers,
    clientStatus: {
      fetch: new ClientStatus({
        name: 'fetch',
        connected: false,
        tools: 0,
        authorization_required: true,
        oauth_authenticated: false,
      }),
      buildkite: new ClientStatus({
        name: 'buildkite',
        connected: true,
        tools: 27,
        authorization_required: false,
        oauth_authenticated: true,
      }),
      'disabled-server': mockClientStatus['disabled-server'],
    },
  },
};

export const LargeList: Story = {
  args: {
    servers: [
      ...mockServers,
      new MCPServerConfig({
        name: 'server-4',
        description: 'Another server',
        command: 'node',
        args: ['app.js'],
        transport: TransportType.TransportStdio,
        enabled: true,
        env: {},
      }),
      new MCPServerConfig({
        name: 'server-5',
        description: 'Yet another server',
        transport: TransportType.TransportSSE,
        endpoint: 'https://api.example.com/sse',
        enabled: false,
        command: '',
      }),
      new MCPServerConfig({
        name: 'server-6',
        description: 'HTTP server with auth',
        transport: TransportType.TransportStreamableHTTP,
        endpoint: 'https://secure.example.com/mcp',
        enabled: true,
        command: '',
        requires_auth: true,
      }),
    ],
    clientStatus: {
      ...mockClientStatus,
      'server-4': new ClientStatus({
        name: 'server-4',
        connected: true,
        tools: 3,
        authorization_required: false,
        oauth_authenticated: false,
      }),
      'server-5': new ClientStatus({
        name: 'server-5',
        connected: false,
        tools: 0,
        authorization_required: false,
        oauth_authenticated: false,
      }),
      'server-6': new ClientStatus({
        name: 'server-6',
        connected: true,
        tools: 15,
        authorization_required: false,
        oauth_authenticated: true,
      }),
    },
  },
};

export const OnDarkBackground: Story = {
  args: {
    servers: mockServers,
    clientStatus: mockClientStatus,
  },
  parameters: {
    backgrounds: { default: 'dark-gray' },
  },
};
