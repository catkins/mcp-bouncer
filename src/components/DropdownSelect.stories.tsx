import type { Meta, StoryObj } from '@storybook/react';
import { DropdownSelect } from './DropdownSelect';

const meta: Meta<typeof DropdownSelect> = {
  title: 'Components/DropdownSelect',
  component: DropdownSelect,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#111827' },
        { name: 'light', value: '#f9fafb' },
      ],
    },
  },
  tags: ['autodocs'],
  args: {
    label: 'Status',
    value: 'all',
    options: [
      { value: 'all', label: 'All' },
      { value: 'success', label: 'Success' },
      { value: 'error', label: 'Error' },
    ],
  },
  argTypes: {
    onChange: { action: 'changed' },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: 'sm',
    label: 'Server',
    value: 'primary',
    options: [
      { value: 'primary', label: 'Primary' },
      { value: 'staging', label: 'Staging' },
      { value: 'backup', label: 'Backup' },
    ],
  },
};

export const WithHelper: Story = {
  args: {
    helperText: 'Choose which events to display',
  },
};

export const WithError: Story = {
  args: {
    error: 'Selection required',
    value: '',
    options: [
      { value: '', label: 'Select status', disabled: true },
      { value: 'success', label: 'Success' },
      { value: 'error', label: 'Error' },
    ],
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const FullWidth: Story = {
  args: {
    fullWidth: true,
    className: 'w-72',
  },
};

