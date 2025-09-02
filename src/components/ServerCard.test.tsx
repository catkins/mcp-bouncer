import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test/render';
import { ServerCard } from './ServerCard';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { TransportType, type MCPServerConfig, type ClientStatus } from '../tauri/bridge';

afterEach(() => cleanup());

const baseServer: MCPServerConfig = {
  name: 'svc',
  description: 'desc',
  transport: TransportType.TransportStdio,
  command: 'cmd',
  args: [],
  env: {},
  enabled: true,
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

  it('shows authorize when required', () => {
    const status: ClientStatus = {
      name: 'svc',
      state: 'disconnected',
      tools: 0,
      authorization_required: true,
      oauth_authenticated: false,
    };
    const onAuthorize = vi.fn();
    render(
      <ServerCard
        server={{ ...baseServer, enabled: true }}
        clientStatus={status}
        onEdit={() => {}}
        onRemove={async () => {}}
        onToggle={async () => {}}
        onAuthorize={async () => onAuthorize()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /authorize svc/i }),
    ).toBeInTheDocument();
  });
});
