import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './button';
import { Heart, Download, Plus, Settings, Trash2 } from 'lucide-react';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: { type: 'select' },
      options: ['default', 'sm', 'lg', 'icon'],
    },
    asChild: {
      control: { type: 'boolean' },
    },
    disabled: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Button',
  },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button>
        <Plus />
        Add Item
      </Button>
      <Button variant="outline">
        <Download />
        Download
      </Button>
      <Button variant="secondary">
        <Settings />
        Settings
      </Button>
      <Button variant="destructive">
        <Trash2 />
        Delete
      </Button>
    </div>
  ),
};

export const IconOnly: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button size="icon">
        <Heart />
      </Button>
      <Button size="icon" variant="outline">
        <Download />
      </Button>
      <Button size="icon" variant="secondary">
        <Settings />
      </Button>
      <Button size="icon" variant="destructive">
        <Trash2 />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button disabled>Disabled</Button>
      <Button disabled variant="outline">
        Disabled Outline
      </Button>
      <Button disabled variant="destructive">
        Disabled Destructive
      </Button>
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div className="flex gap-4">
      <Button disabled>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        Loading...
      </Button>
      <Button variant="outline" disabled>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
        Processing
      </Button>
    </div>
  ),
};

export const AsChild: Story = {
  render: () => (
    <Button asChild>
      <a href="https://example.com" target="_blank" rel="noopener noreferrer">
        External Link
      </a>
    </Button>
  ),
};
