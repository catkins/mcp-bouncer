import type { Meta, StoryObj } from '@storybook/react';
import { ToggleSwitch } from './ToggleSwitch';

const meta: Meta<typeof ToggleSwitch> = {
  title: 'Components/ToggleSwitch',
  component: ToggleSwitch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    checked: false,
    disabled: false,
  },
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    onChange: { action: 'toggled' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: {
    checked: true,
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Enable notifications',
    checked: true,
  },
};

export const WithLabelAndDescription: Story = {
  args: {
    label: 'Enable notifications',
    description: 'Receive push notifications for important updates',
    checked: false,
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    label: 'Small toggle',
    checked: true,
  },
};

export const Medium: Story = {
  args: {
    size: 'md',
    label: 'Medium toggle',
    checked: true,
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    label: 'Large toggle',
    checked: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    label: 'Disabled toggle',
  },
};

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    checked: true,
    label: 'Disabled (checked)',
    description: 'This toggle is disabled but checked',
  },
};
