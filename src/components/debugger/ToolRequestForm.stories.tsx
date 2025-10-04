import type { Meta, StoryObj } from '@storybook/react';
import { ToolRequestForm } from './ToolRequestForm';
import type { Tool } from '../../tauri/bridge';

const structuredTool: Tool = {
  name: 'server::compose',
  description: 'Compose a short email reply',
  input_schema: {
    type: 'object',
    required: ['recipient', 'tone'],
    properties: {
      recipient: { type: 'string', description: 'Recipient name' },
      tone: { type: 'string', description: 'Desired tone (friendly, formal, etc.)' },
      include_signature: { type: 'boolean', description: 'Append a signature', default: true },
    },
  },
};

const arrayTool: Tool = {
  name: 'server::tag',
  description: 'Tag content with relevant keywords',
  input_schema: {
    type: 'object',
    required: ['keywords'],
    properties: {
      keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords to attach' },
    },
  },
};

const jsonOnlyTool: Tool = {
  name: 'server::noop',
  description: 'No parameters required',
  input_schema: null,
};

const meta: Meta<typeof ToolRequestForm> = {
  title: 'Components/Debugger/ToolRequestForm',
  component: ToolRequestForm,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    tool: structuredTool,
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

export const StructuredForm: Story = {};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const ArrayField: Story = {
  args: {
    tool: arrayTool,
  },
};

export const JsonOnly: Story = {
  args: {
    tool: jsonOnlyTool,
  },
};
