import type { Meta, StoryObj } from '@storybook/react';
import { Header } from './Header';

const meta: Meta<typeof Header> = {
  title: 'Components/Header',
  component: Header,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#f9fafb' },
        { name: 'dark', value: '#111827' },
      ],
    },
  },
  tags: ['autodocs'],
  args: {
    isActive: true,
    mcpUrl: 'localhost:3000',
  },
  argTypes: {
    isActive: {
      control: { type: 'select' },
      options: [true, false, null],
      description: 'Server connection status',
    },
    onOpenConfig: { action: 'openConfig' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LightTheme: Story = {
  args: {
    isActive: true,
  },
};

export const DarkTheme: Story = {
  args: {
    isActive: true,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const ServerActive: Story = {
  args: {
    isActive: true,
  },
};

export const ServerInactive: Story = {
  args: {
    isActive: false,
  },
};

export const ServerChecking: Story = {
  args: {
    isActive: null,
  },
};

export const LongUrl: Story = {
  args: {
    mcpUrl: 'https://very-long-domain-name.example.com:8080/api/v1/mcp',
    isActive: true,
  },
};

export const CustomPort: Story = {
  args: {
    mcpUrl: 'localhost:8000',
    isActive: true,
  },
};

export const HttpsUrl: Story = {
  args: {
    mcpUrl: 'https://mcp.example.com',
    isActive: true,
  },
};

export const DarkThemeInactive: Story = {
  args: {
    isActive: false,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export const DarkThemeChecking: Story = {
  args: {
    isActive: null,
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
