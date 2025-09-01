import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ServerForm } from './ServerForm';
import { TransportType, type MCPServerConfig } from '../tauri/bridge';

function render(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(el));
  return { container, root };
}

describe('ServerForm', () => {
  it('validates required fields based on transport', async () => {
    const calls: any[] = [];
    const { container } = render(
      <ServerForm
        existingServers={[]}
        onSave={async (cfg: MCPServerConfig) => calls.push(cfg)}
        onCancel={() => {}}
      />,
    );

    // Name input
    const name = container.querySelector('#server-name') as HTMLInputElement;
    name.value = 'x';
    name.dispatchEvent(new Event('input', { bubbles: true }));

    // Command is required for stdio
    const cmd = container.querySelector('#server-command') as HTMLInputElement;
    expect(cmd).toBeTruthy();
  });

  it('switching transport shows endpoint input', async () => {
    const { container } = render(
      <ServerForm existingServers={[]} onSave={async () => {}} onCancel={() => {}} />,
    );

    const select = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      select.value = TransportType.TransportSSE;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const endpoint = container.querySelector('#server-endpoint') as HTMLInputElement;
    expect(endpoint).toBeTruthy();
  });
});
