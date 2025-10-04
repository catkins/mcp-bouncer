import type { Meta, StoryObj } from '@storybook/react';
import { RequestPanel } from './RequestPanel';
import type { Tool } from '../../tauri/bridge';

const exampleTool: Tool = {
  name: 'server::summarize',
  description: 'Summarize content into concise bullet points',
  input_schema: {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string', description: 'Text to summarize' },
      sentences: { type: 'integer', description: 'Number of sentences to return', default: 3 },
    },
  },
};

const meta: Meta<typeof RequestPanel> = {
  title: 'Components/Debugger/RequestPanel',
  component: RequestPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    tool: exampleTool,
    disabled: false,
    loading: false,
  },
  argTypes: {
    onSubmit: { action: 'submit' },
    tool: { control: { type: 'object' } },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const EmptyState: Story = {
  args: {
    tool: null,
  },
};
