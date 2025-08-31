import type { Meta, StoryObj } from '@storybook/react';
import { StatusIndicator } from './StatusIndicator';

const meta: Meta<typeof StatusIndicator> = {
  title: 'Components/StatusIndicator',
  component: StatusIndicator,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light-gray',
      values: [
        { name: 'light-gray', value: '#f3f4f6' },
        { name: 'dark-gray', value: '#1f2937' },
        { name: 'white', value: '#ffffff' },
        { name: 'black', value: '#000000' },
      ],
    },
  },
  tags: ['autodocs'],
  args: {
    isActive: true,
  },
  argTypes: {
    isActive: {
      control: { type: 'select' },
      options: [true, false, null],
      description: 'Server status: true = active, false = inactive, null = checking',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  args: {
    isActive: true,
  },
};

export const Inactive: Story = {
  args: {
    isActive: false,
  },
};

export const Checking: Story = {
  args: {
    isActive: null,
  },
};

export const ActiveOnDark: Story = {
  args: {
    isActive: true,
  },
  parameters: {
    backgrounds: { default: 'dark-gray' },
  },
};

export const InactiveOnDark: Story = {
  args: {
    isActive: false,
  },
  parameters: {
    backgrounds: { default: 'dark-gray' },
  },
};

export const CheckingOnDark: Story = {
  args: {
    isActive: null,
  },
  parameters: {
    backgrounds: { default: 'dark-gray' },
  },
};

export const ActiveOnWhite: Story = {
  args: {
    isActive: true,
  },
  parameters: {
    backgrounds: { default: 'white' },
  },
};

export const InactiveOnWhite: Story = {
  args: {
    isActive: false,
  },
  parameters: {
    backgrounds: { default: 'white' },
  },
};
