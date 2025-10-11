import type { Meta, StoryObj } from '@storybook/react';
import { Toast, ToastContainer, ToastType } from './Toast';
import { useState } from 'react';

const meta: Meta<typeof Toast> = {
  title: 'Components/Toast',
  component: Toast,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light-gray',
      values: [
        { name: 'light-gray', value: '#f3f4f6' },
        { name: 'dark-gray', value: '#1f2937' },
      ],
    },
  },
  tags: ['autodocs'],
  args: {
    id: 'toast-1',
    type: 'success',
    title: 'Success!',
    message: 'Your action was completed successfully.',
    duration: 5000,
  },
  argTypes: {
    type: {
      control: { type: 'select' },
      options: ['success', 'error', 'warning', 'info'],
    },
    duration: {
      control: { type: 'range', min: 1000, max: 10000, step: 1000 },
    },
    onClose: { action: 'closed' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: {
    type: 'success',
    title: 'Success!',
    message: 'Your server was added successfully.',
  },
};

export const Error: Story = {
  args: {
    type: 'error',
    title: 'Error',
    message: 'Failed to connect to the server. Please check your configuration.',
  },
};

export const Warning: Story = {
  args: {
    type: 'warning',
    title: 'Warning',
    message: 'Server is running but some tools may be unavailable.',
  },
};

export const Info: Story = {
  args: {
    type: 'info',
    title: 'Info',
    message: 'Server restart completed.',
  },
};

export const LongMessage: Story = {
  args: {
    type: 'error',
    title: 'Connection Failed',
    message:
      'Unable to establish connection to the MCP server at localhost:3000. This could be due to network issues, server downtime, or incorrect configuration. Please verify your settings and try again.',
  },
};

export const TitleOnly: Story = {
  args: {
    type: 'success',
    title: 'Server Started',
  },
};

export const ShortDuration: Story = {
  args: {
    type: 'warning',
    title: 'Quick Toast',
    message: 'This toast will disappear quickly.',
    duration: 2000,
  },
};

export const LongDuration: Story = {
  args: {
    type: 'info',
    title: 'Persistent Toast',
    message: 'This toast will stay around for a while.',
    duration: 8000,
  },
};

// ToastContainer stories
const ToastContainerMeta: Meta<typeof ToastContainer> = {
  title: 'Components/ToastContainer',
  component: ToastContainer,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'light-gray',
      values: [
        { name: 'light-gray', value: '#f3f4f6' },
        { name: 'dark-gray', value: '#1f2937' },
      ],
    },
  },
  tags: ['autodocs'],
  argTypes: {
    onClose: { action: 'closed' },
  },
};

export const Container = ToastContainerMeta;

export const MultipleToasts: StoryObj<typeof ToastContainer> = {
  args: {
    toasts: [
      {
        id: 'toast-1',
        type: 'success' as ToastType,
        title: 'Server Added',
        message: 'fetch server was added successfully.',
      },
      {
        id: 'toast-2',
        type: 'warning' as ToastType,
        title: 'Connection Slow',
        message: 'Server is responding slowly.',
      },
      {
        id: 'toast-3',
        type: 'info' as ToastType,
        title: 'Update Available',
        message: 'A new version is available.',
      },
    ],
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export const SingleToast: StoryObj<typeof ToastContainer> = {
  args: {
    toasts: [
      {
        id: 'toast-1',
        type: 'error' as ToastType,
        title: 'Connection Failed',
        message: 'Unable to connect to the MCP server.',
      },
    ],
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export const MixedTypes: StoryObj<typeof ToastContainer> = {
  args: {
    toasts: [
      {
        id: 'toast-1',
        type: 'success' as ToastType,
        title: 'Success',
      },
      {
        id: 'toast-2',
        type: 'error' as ToastType,
        title: 'Error',
        message: 'Something went wrong.',
      },
      {
        id: 'toast-3',
        type: 'warning' as ToastType,
        title: 'Warning',
        message: 'Please check your settings.',
      },
      {
        id: 'toast-4',
        type: 'info' as ToastType,
        title: 'Info',
        message: 'Just so you know.',
      },
    ],
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export const EmptyContainer: StoryObj<typeof ToastContainer> = {
  args: {
    toasts: [],
  },
  parameters: {
    layout: 'fullscreen',
  },
};

// Interactive example with state management
export const InteractiveContainer = () => {
  const [toasts, setToasts] = useState<
    Array<{
      id: string;
      type: ToastType;
      title: string;
      message?: string;
    }>
  >([]);

  const addToast = (type: ToastType) => {
    const id = `toast-${Date.now()}`;
    const messages = {
      success: { title: 'Success!', message: 'Operation completed successfully.' },
      error: { title: 'Error', message: 'Something went wrong.' },
      warning: { title: 'Warning', message: 'Please be careful.' },
      info: { title: 'Info', message: 'Here is some information.' },
    };

    setToasts(prev => [...prev, { id, type, ...messages[type] }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  return (
    <div className="p-8">
      <div className="space-x-4 mb-8">
        <button
          onClick={() => addToast('success')}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Add Success
        </button>
        <button
          onClick={() => addToast('error')}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Add Error
        </button>
        <button
          onClick={() => addToast('warning')}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
        >
          Add Warning
        </button>
        <button
          onClick={() => addToast('info')}
          className="px-4 py-2 bg-brand-500 text-white rounded hover:bg-brand-600"
        >
          Add Info
        </button>
        <button
          onClick={() => setToasts([])}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Clear All
        </button>
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
};

InteractiveContainer.parameters = {
  layout: 'fullscreen',
};
