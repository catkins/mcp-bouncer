import type { Meta, StoryObj } from '@storybook/react';
import { ToolListPanel } from './ToolListPanel';
import type { Tool } from '../../tauri/bridge';

const sampleTools: Tool[] = [
  {
    name: 'server::search',
    description: 'Search the web for relevant documents',
  },
  {
    name: 'server::summarize',
    description: 'Summarize provided content into key points',
  },
  {
    name: 'server::translate',
    description: 'Translate text between languages',
  },
];

const meta: Meta<typeof ToolListPanel> = {
  title: 'Components/Debugger/ToolListPanel',
  component: ToolListPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    tools: sampleTools,
    filteredTools: sampleTools,
    selectedToolName: 'server::search',
    loading: false,
    error: null,
    search: '',
  },
  argTypes: {
    onRefresh: { action: 'refresh' },
    onSelectTool: { action: 'select-tool' },
    onSearchChange: { action: 'search-change' },
    error: {
      control: 'text',
    },
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

export const WithError: Story = {
  args: {
    error: 'Unable to load tools',
  },
};

export const Filtered: Story = {
  args: {
    search: 'sum',
    filteredTools: sampleTools.filter(tool => tool.name === 'server::summarize'),
  },
};
