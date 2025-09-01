import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/render';
import userEvent from '@testing-library/user-event';
import { ServerForm } from './ServerForm';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { TransportType, type MCPServerConfig } from '../tauri/bridge';

afterEach(() => cleanup());

describe('ServerForm', () => {
  it('validates required fields based on transport', async () => {
    const calls: any[] = [];
    render(
      <ServerForm
        existingServers={[]}
        onSave={async (cfg: MCPServerConfig) => { calls.push(cfg); }}
        onCancel={() => {}}
      />,
    );

    // Name input
    const name = screen.getByLabelText(/Name/i) as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'x');

    // Command is required for stdio
    expect(screen.getByLabelText(/Command/i)).toBeInTheDocument();
  });

  it('switching transport shows endpoint input', async () => {
    render(
      <ServerForm existingServers={[]} onSave={async () => {}} onCancel={() => {}} />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await userEvent.selectOptions(select, TransportType.TransportSSE);
    expect(screen.getByLabelText(/Endpoint/i)).toBeInTheDocument();
  });
});
