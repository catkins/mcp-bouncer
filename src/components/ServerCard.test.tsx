import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ServerCard } from './ServerCard';
import { TransportType, type MCPServerConfig, type ClientStatus } from '../tauri/bridge';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(el);
  return { container, root };
}

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
      connected: true,
      tools: 3,
      authorization_required: false,
      oauth_authenticated: false,
    };
    const { container } = render(
      <ServerCard
        server={baseServer}
        clientStatus={clientStatus}
        onEdit={() => {}}
        onRemove={async () => {}}
        onToggle={async () => {}}
      />,
    );
    expect(container.textContent).toContain('Connected');
    expect(container.textContent).toContain('stdio');
  });

  it('shows authorize when required', () => {
    const status: ClientStatus = {
      name: 'svc',
      connected: false,
      tools: 0,
      authorization_required: true,
      oauth_authenticated: false,
    };
    const onAuthorize = vi.fn();
    const { container } = render(
      <ServerCard
        server={{ ...baseServer, enabled: true }}
        clientStatus={status}
        onEdit={() => {}}
        onRemove={async () => {}}
        onToggle={async () => {}}
        onAuthorize={async () => onAuthorize()}
      />,
    );
    const btn = container.querySelector('button[aria-label^="Authorize"]');
    expect(btn).toBeTruthy();
  });
});

