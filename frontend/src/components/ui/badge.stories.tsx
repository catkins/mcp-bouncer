import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';
import { Check, X, AlertTriangle, Star, Zap } from 'lucide-react';

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'secondary', 'destructive', 'outline'],
    },
    asChild: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Badge',
  },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">
        <Check />
        Verified
      </Badge>
      <Badge variant="secondary">
        <Star />
        Featured
      </Badge>
      <Badge variant="destructive">
        <X />
        Error
      </Badge>
      <Badge variant="outline">
        <AlertTriangle />
        Warning
      </Badge>
    </div>
  ),
};

export const StatusBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">
        <div className="w-2 h-2 bg-green-400 rounded-full mr-1"></div>
        Online
      </Badge>
      <Badge variant="secondary">
        <div className="w-2 h-2 bg-yellow-400 rounded-full mr-1"></div>
        Away
      </Badge>
      <Badge variant="destructive">
        <div className="w-2 h-2 bg-red-400 rounded-full mr-1"></div>
        Offline
      </Badge>
      <Badge variant="outline">
        <div className="w-2 h-2 bg-gray-400 rounded-full mr-1"></div>
        Unknown
      </Badge>
    </div>
  ),
};

export const CountBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge variant="default">1</Badge>
      <Badge variant="secondary">23</Badge>
      <Badge variant="destructive">99+</Badge>
      <Badge variant="outline">NEW</Badge>
    </div>
  ),
};

export const InteractiveBadges: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge asChild>
        <button className="cursor-pointer hover:opacity-80">
          <Zap />
          Clickable
        </button>
      </Badge>
      <Badge variant="outline" asChild>
        <a href="#" className="cursor-pointer hover:opacity-80">
          Link Badge
        </a>
      </Badge>
    </div>
  ),
};

export const LongText: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 max-w-md">
      <Badge variant="default">
        This is a very long badge text that should wrap nicely
      </Badge>
      <Badge variant="outline">
        <AlertTriangle />
        Long warning message badge
      </Badge>
    </div>
  ),
};

export const CustomStyling: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
        Gradient
      </Badge>
      <Badge className="bg-blue-100 text-blue-800 border-blue-200">
        Custom Blue
      </Badge>
      <Badge className="bg-green-100 text-green-800 border-green-200">
        Custom Green
      </Badge>
    </div>
  ),
};
