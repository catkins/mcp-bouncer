import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Tool } from '../../tauri/bridge';
import { ToolRequestForm } from './ToolRequestForm';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const stringTool: Tool = {
  name: 'server::echo',
  description: 'Echo tool',
  input_schema: {
    type: 'object',
    required: ['message'],
    properties: {
      message: { type: 'string', description: 'Message to echo' },
    },
  },
};

describe('ToolRequestForm', () => {
  it('submits structured form payloads', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const { getByLabelText, getAllByRole } = render(
      <ToolRequestForm tool={stringTool} disabled={false} loading={false} onSubmit={handleSubmit} />,
    );

    const input = getByLabelText(/message/i);
    fireEvent.change(input, { target: { value: 'hello' } });

    const [callButton] = getAllByRole('button', { name: /Call Tool/i });
    expect(callButton).toBeDefined();
    fireEvent.click(callButton!);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({ message: 'hello' });
    });
  });

  it('switches to JSON mode via toggle', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const { getAllByRole, findByRole } = render(
      <ToolRequestForm tool={stringTool} disabled={false} loading={false} onSubmit={handleSubmit} />,
    );

    const [toggle] = getAllByRole('button', { name: /Toggle switch/i });
    expect(toggle).toBeDefined();
    fireEvent.click(toggle!);

    const textarea = await findByRole('textbox');
    fireEvent.change(textarea, { target: { value: '{"message":"json"}' } });
    const [jsonCallButton] = getAllByRole('button', { name: /Call Tool/i });
    expect(jsonCallButton).toBeDefined();
    fireEvent.click(jsonCallButton!);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({ message: 'json' });
    });
  });

  it('shows JSON-only helper state when tool declares no params', async () => {
    const noArgsTool: Tool = {
      name: 'server::noop',
      description: 'No-op tool',
      input_schema: null,
    };
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const { getByText, getAllByRole, findByRole } = render(
      <ToolRequestForm tool={noArgsTool} disabled={false} loading={false} onSubmit={handleSubmit} />,
    );

    expect(getByText(/No request parameters needed/i)).toBeInTheDocument();
    const [initialCallButton] = getAllByRole('button', { name: /Call Tool/i });
    expect(initialCallButton).toBeDefined();
    fireEvent.click(initialCallButton!);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(undefined);
    });

    const [provideButton] = getAllByRole('button', { name: /Provide JSON payload/i });
    expect(provideButton).toBeDefined();
    fireEvent.click(provideButton!);
    const textarea = await findByRole('textbox');
    fireEvent.change(textarea, { target: { value: '{"flag":true}' } });
    const [secondCallButton] = getAllByRole('button', { name: /Call Tool/i });
    expect(secondCallButton).toBeDefined();
    fireEvent.click(secondCallButton!);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith({ flag: true });
    });
  });

  it('validates required fields before submitting', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);
    const { getAllByRole, getByText } = render(
      <ToolRequestForm tool={stringTool} disabled={false} loading={false} onSubmit={handleSubmit} />,
    );

    const [validationButton] = getAllByRole('button', { name: /Call Tool/i });
    expect(validationButton).toBeDefined();
    fireEvent.click(validationButton!);

    await waitFor(() => {
      expect(getByText(/This field is required/i)).toBeInTheDocument();
    });
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
