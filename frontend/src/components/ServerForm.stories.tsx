import type { Meta, StoryObj } from '@storybook/react';
import { ServerForm } from './ServerForm';
import { MCPServerConfig, TransportType } from '../../bindings/github.com/catkins/mcp-bouncer/pkg/services/settings/models';

// Mock existing servers for validation testing
const mockExistingServers = [
  new MCPServerConfig({
    name: 'existing-server',
    description: 'An existing server',
    command: 'node',
    args: ['server.js'],
    transport: TransportType.TransportStdio,
    enabled: true,
    env: {},
  }),
  new MCPServerConfig({
    name: 'another-server',
    description: 'Another existing server',
    command: 'python',
    args: ['-m', 'mcp_server'],
    transport: TransportType.TransportStdio,
    enabled: false,
    env: { DEBUG: 'true' },
  }),
];

const meta: Meta<typeof ServerForm> = {
  title: 'Components/ServerForm',
  component: ServerForm,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark-overlay',
      values: [
        { name: 'dark-overlay', value: 'rgba(0, 0, 0, 0.5)' },
        { name: 'light-overlay', value: 'rgba(255, 255, 255, 0.8)' },
      ],
    },
  },
  tags: ['autodocs'],
  args: {
    loading: false,
    existingServers: [],
  },
  argTypes: {
    onSave: { action: 'saved' },
    onCancel: { action: 'cancelled' },
    server: {
      control: { type: 'object' },
      description: 'Server to edit (null for new server)',
    },
    loading: {
      control: { type: 'boolean' },
      description: 'Show loading state',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const AddNewServer: Story = {
  args: {
    server: null,
  },
};

export const AddNewServerWithExisting: Story = {
  args: {
    server: null,
    existingServers: mockExistingServers,
  },
};

export const EditStdioServer: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'fetch',
      description: 'Fetch things from the web',
      command: 'uvx',
      args: ['mcp-server-fetch'],
      transport: TransportType.TransportStdio,
      enabled: true,
      env: {
        API_KEY: 'your-api-key',
        DEBUG: 'true',
      },
    }),
    existingServers: mockExistingServers,
  },
};

export const EditHttpServer: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'buildkite',
      description: 'CI/CD pipeline integration',
      transport: TransportType.TransportStreamableHTTP,
      endpoint: 'http://localhost:7700/mcp',
      enabled: true,
      command: '',
      headers: {
        'Authorization': 'Bearer token123',
        'Content-Type': 'application/json',
      },
    }),
    existingServers: mockExistingServers,
  },
};

export const EditSseServer: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'Context7',
      description: 'SSE server for real-time updates',
      transport: TransportType.TransportSSE,
      endpoint: 'https://mcp.context7.com/sse',
      enabled: true,
      command: '',
      headers: {
        'X-API-Key': 'secret-key',
      },
    }),
    existingServers: mockExistingServers,
  },
};

export const EditServerWithAuth: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'oauth-server',
      description: 'Server requiring OAuth authentication',
      transport: TransportType.TransportStreamableHTTP,
      endpoint: 'https://api.example.com/mcp',
      enabled: true,
      command: '',
      requires_auth: true,
      headers: {
        'Content-Type': 'application/json',
      },
    }),
    existingServers: mockExistingServers,
  },
};

export const EditComplexStdioServer: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'complex-server',
      description: 'A complex server with many environment variables and arguments',
      command: 'python',
      args: ['-m', 'myserver', '--verbose', '--config', '/path/to/config.json'],
      transport: TransportType.TransportStdio,
      enabled: true,
      env: {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        API_KEY: 'secret-api-key',
        LOG_LEVEL: 'debug',
        CACHE_TTL: '3600',
        FEATURE_FLAGS: 'feature1,feature2,feature3',
      },
    }),
    existingServers: mockExistingServers,
  },
};

export const EditDisabledServer: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'disabled-server',
      description: 'A server that is currently disabled',
      command: 'node',
      args: ['server.js'],
      transport: TransportType.TransportStdio,
      enabled: false,
      env: {},
    }),
    existingServers: mockExistingServers,
  },
};

export const LoadingState: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'test-server',
      description: 'Testing server',
      command: 'echo',
      args: ['hello'],
      transport: TransportType.TransportStdio,
      enabled: true,
      env: {},
    }),
    loading: true,
    existingServers: mockExistingServers,
  },
};

export const MinimalStdioServer: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'minimal',
      description: '',
      command: 'echo',
      args: [],
      transport: TransportType.TransportStdio,
      enabled: true,
      env: {},
    }),
  },
};

export const MinimalHttpServer: Story = {
  args: {
    server: new MCPServerConfig({
      name: 'minimal-http',
      description: '',
      transport: TransportType.TransportStreamableHTTP,
      endpoint: 'http://localhost:3000',
      enabled: true,
      command: '',
      headers: {},
    }),
  },
};

export const EmptyForm: Story = {
  args: {
    server: null,
    existingServers: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'Empty form for adding a new server with default values',
      },
    },
  },
};
