import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { render, screen } from '../../test/render';
import { ServerCard } from './ServerCard';
import { TransportType, type MCPServerConfig, type ClientStatus } from '../../tauri/bridge';

afterEach(() => cleanup());

const baseServer: MCPServerConfig = {
  name: 'svc',
  description: 'desc',
  transport: TransportType.Stdio,
  command: 'cmd',
  args: [],
  env: {},
  enabled: true,
  endpoint: '',
  headers: {},
};

describe('ServerCard', () => {
  it('shows transport badge and connected state', () => {
    const clientStatus: ClientStatus = {
      name: 'svc',
      state: 'connected',
      tools: 3,
      authorization_required: false,
      oauth_authenticated: false,
    };
    render(
      <ServerCard
        server={baseServer}
        clientStatus={clientStatus}
        onEdit={() => {}}
        onRemove={async () => {}}
        onToggle={async () => {}}
      />,
    );
    expect(screen.getByText(/Connected/i)).toBeInTheDocument();
    expect(screen.getByText(/stdio/i)).toBeInTheDocument();
  });

  it('makes Authorization required clickable for streamable_http', () => {
    const status: ClientStatus = {
      name: 'svc',
      state: 'requires_authorization',
      tools: 0,
      authorization_required: true,
      oauth_authenticated: false,
    };
    const onAuthorize = vi.fn();
    render(
      <ServerCard
        server={{ ...baseServer, enabled: true, transport: 'streamable_http' as any, endpoint: 'http://localhost', headers: {} }}
        clientStatus={status}
        onEdit={() => {}}
        onRemove={async () => {}}
        onToggle={async () => {}}
        onAuthorize={async () => onAuthorize()}
      />,
    );
    const authChip = screen.getByRole('button', { name: /authorize svc/i });
    expect(authChip).toBeInTheDocument();
  });

  it('shows requires_authorization badge and hides error banner on 401 state', () => {
    const status: ClientStatus = {
      name: 'svc',
      state: 'requires_authorization',
      tools: 0,
      last_error: 'some error',
      authorization_required: true,
      oauth_authenticated: false,
    };
    render(
      <ServerCard
        server={{ ...baseServer, enabled: true }}
        clientStatus={status}
        onEdit={() => {}}
        onRemove={async () => {}}
        onToggle={async () => {}}
      />,
    );
    expect(screen.getByText(/authorization required/i)).toBeInTheDocument();
    expect(screen.queryByText(/connection error/i)).not.toBeInTheDocument();
  });

  it('shows authorizing badge when OAuth flow started', () => {
    const status: ClientStatus = {
      name: 'svc',
      state: 'authorizing',
      tools: 0,
      authorization_required: true,
      oauth_authenticated: false,
    };
    render(
      <ServerCard
        server={{ ...baseServer, enabled: true }}
        clientStatus={status}
        onEdit={() => {}}
        onRemove={async () => {}}
        onToggle={async () => {}}
      />,
    );
    expect(screen.getByText(/authorizing/i)).toBeInTheDocument();
  });
});
