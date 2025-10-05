import type { Meta, StoryObj } from '@storybook/react';
import { ServerForm } from './ServerForm';
import type { MCPServerConfig } from '../../tauri/bridge';
import { TransportType } from '../../tauri/bridge';

// Mock existing servers for validation testing
const mockExistingServers: MCPServerConfig[] = [
  {
    name: 'existing-server',
    description: 'An existing server',
    command: 'node',
    args: ['server.js'],
    transport: TransportType.Stdio,
    enabled: true,
    env: {},
    endpoint: '',
    headers: {},
    requires_auth: false,
  },
  {
    name: 'another-server',
    description: 'Another existing server',
    command: 'python',
    args: ['-m', 'mcp_server'],
    transport: TransportType.Stdio,
    enabled: false,
    env: { DEBUG: 'true' },
    endpoint: '',
    headers: {},
    requires_auth: false,
  },
];

const meta: Meta<typeof ServerForm> = {
  title: 'Components/Servers/ServerForm',
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
    server: {
      name: 'fetch',
      description: 'Fetch things from the web',
      command: 'uvx',
      args: ['mcp-server-fetch'],
      transport: TransportType.Stdio,
      enabled: true,
      env: {
        API_KEY: 'your-api-key',
        DEBUG: 'true',
      },
      endpoint: '',
      headers: {},
      requires_auth: false,
    },
    existingServers: mockExistingServers,
  },
};

export const EditHttpServer: Story = {
  args: {
    server: {
      name: 'buildkite',
      description: 'CI/CD pipeline integration',
      transport: TransportType.StreamableHttp,
      endpoint: 'http://localhost:7700/mcp',
      enabled: true,
      command: '',
      args: [],
      env: {},
      headers: {
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json',
      },
      requires_auth: false,
    },
    existingServers: mockExistingServers,
  },
};

export const EditSseServer: Story = {
  args: {
    server: {
      name: 'Context7',
      description: 'SSE server for real-time updates',
      transport: TransportType.Sse,
      endpoint: 'https://mcp.context7.com/sse',
      enabled: true,
      command: '',
      args: [],
      env: {},
      headers: {
        'X-API-Key': 'secret-key',
      },
      requires_auth: false,
    },
    existingServers: mockExistingServers,
  },
};

export const EditServerWithAuth: Story = {
  args: {
    server: {
      name: 'oauth-server',
      description: 'Server requiring OAuth authentication',
      transport: TransportType.StreamableHttp,
      endpoint: 'https://api.example.com/mcp',
      enabled: true,
      command: '',
      requires_auth: true,
      headers: {
        'Content-Type': 'application/json',
      },
      args: [],
      env: {},
    },
    existingServers: mockExistingServers,
  },
};

export const EditComplexStdioServer: Story = {
  args: {
    server: {
      name: 'complex-server',
      description: 'A complex server with many environment variables and arguments',
      command: 'python',
      args: ['-m', 'myserver', '--verbose', '--config', '/path/to/config.json'],
      transport: TransportType.Stdio,
      enabled: true,
      env: {
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        API_KEY: 'secret-api-key',
        LOG_LEVEL: 'debug',
        CACHE_TTL: '3600',
        FEATURE_FLAGS: 'feature1,feature2,feature3',
      },
      endpoint: '',
      headers: {},
      requires_auth: false,
    },
    existingServers: mockExistingServers,
  },
};

export const EditDisabledServer: Story = {
  args: {
    server: {
      name: 'disabled-server',
      description: 'A server that is currently disabled',
      command: 'node',
      args: ['server.js'],
      transport: TransportType.Stdio,
      enabled: false,
      env: {},
      endpoint: '',
      headers: {},
      requires_auth: false,
    },
    existingServers: mockExistingServers,
  },
};

export const LoadingState: Story = {
  args: {
    server: {
      name: 'test-server',
      description: 'Testing server',
      command: 'echo',
      args: ['hello'],
      transport: TransportType.Stdio,
      enabled: true,
      env: {},
      endpoint: '',
      headers: {},
      requires_auth: false,
    },
    loading: true,
    existingServers: mockExistingServers,
  },
};

export const MinimalStdioServer: Story = {
  args: {
    server: {
      name: 'minimal',
      description: '',
      command: 'echo',
      args: [],
      transport: TransportType.Stdio,
      enabled: true,
      env: {},
      endpoint: '',
      headers: {},
      requires_auth: false,
    },
  },
};

export const MinimalHttpServer: Story = {
  args: {
    server: {
      name: 'minimal-http',
      description: '',
      transport: TransportType.StreamableHttp,
      endpoint: 'http://localhost:3000',
      enabled: true,
      command: '',
      headers: {},
      args: [],
      env: {},
      requires_auth: false,
    },
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
