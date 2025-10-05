import type { Meta, StoryObj } from '@storybook/react';
import { ServerCard } from './ServerCard';

const meta: Meta<typeof ServerCard> = {
  title: 'Components/Servers/ServerCard',
  component: ServerCard,
};

export default meta;

export type Story = StoryObj<typeof ServerCard>;

const baseServer = {
  name: 'Example Server',
  description: 'A test server configuration',
  transport: 'stdio' as const,
  command: 'cmd',
  args: ['--flag'],
  env: { NODE_ENV: 'production' },
  enabled: true,
  endpoint: '',
  headers: {},
  requires_auth: false,
};

export const ConnectedWithTools: Story = {
  args: {
    server: baseServer,
    clientStatus: {
      name: 'Example Server',
      state: 'connected',
      tools: 4,
      authorization_required: false,
      oauth_authenticated: true,
    },
  },
};

export const RequiresAuthorization: Story = {
  args: {
    server: { ...baseServer, transport: 'streamable_http', endpoint: 'https://example.com', headers: { Authorization: 'Bearer ...' } },
    clientStatus: {
      name: 'Example Server',
      state: 'requires_authorization',
      tools: 0,
      authorization_required: true,
      oauth_authenticated: false,
    },
  },
};

export const WithError: Story = {
  args: {
    server: baseServer,
    clientStatus: {
      name: 'Example Server',
      state: 'errored',
      tools: 0,
      authorization_required: false,
      oauth_authenticated: false,
      last_error: 'Connection failed',
    },
    toggleError: 'Failed to enable server',
  },
};
