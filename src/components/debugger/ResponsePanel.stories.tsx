import type { Meta, StoryObj } from '@storybook/react';
import { ResponsePanel } from './ResponsePanel';
import type { CallOutcome } from './types';

const successOutcome: CallOutcome = {
  timestamp: Date.now(),
  ok: true,
  durationMs: 95,
  request: { input: 'Explain quantum tunnelling' },
  result: {
    content: [
      {
        type: 'text',
        text: 'Quantum tunnelling is the ability of a particle to pass through a barrier it classically should not cross.',
      },
    ],
  },
};

const errorOutcome: CallOutcome = {
  ...successOutcome,
  ok: false,
  durationMs: 140,
  result: {
    is_error: true,
    content: [{ type: 'text', text: 'The upstream server returned 503 Service Unavailable.' }],
  },
};

const meta: Meta<typeof ResponsePanel> = {
  title: 'Components/Debugger/ResponsePanel',
  component: ResponsePanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    callResult: successOutcome,
    callError: null,
    selectedToolName: 'server::answer',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};

export const ErrorState: Story = {
  args: {
    callResult: errorOutcome,
  },
};

export const TransportError: Story = {
  args: {
    callResult: null,
    callError: 'Failed to reach the server. Check your network connection.',
  },
};

export const Empty: Story = {
  args: {
    callResult: null,
    callError: null,
  },
};
