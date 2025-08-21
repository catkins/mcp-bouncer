import type { Meta, StoryObj } from '@storybook/react';
import { toast } from 'sonner';
import { Toaster } from './sonner';
import { Button } from './button';
import { Check, X, AlertTriangle, Info, Heart, Download, Settings } from 'lucide-react';

const meta: Meta<typeof Toaster> = {
  title: 'UI/Sonner (Toast)',
  component: Toaster,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div>
        <Story />
        <Toaster />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicToasts: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => toast('Hello World!')}>
        Default Toast
      </Button>
      <Button 
        variant="secondary"
        onClick={() => toast.success('Profile updated successfully!')}
      >
        Success Toast
      </Button>
      <Button 
        variant="destructive"
        onClick={() => toast.error('Something went wrong!')}
      >
        Error Toast
      </Button>
      <Button 
        variant="outline"
        onClick={() => toast.warning('Please check your input')}
      >
        Warning Toast
      </Button>
    </div>
  ),
};

export const ToastWithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => toast.success('Success!', {
        icon: <Check className="h-4 w-4" />
      })}>
        <Check />
        Success with Icon
      </Button>
      <Button 
        variant="destructive"
        onClick={() => toast.error('Error occurred!', {
          icon: <X className="h-4 w-4" />
        })}
      >
        <X />
        Error with Icon
      </Button>
      <Button 
        variant="outline"
        onClick={() => toast.warning('Warning!', {
          icon: <AlertTriangle className="h-4 w-4" />
        })}
      >
        <AlertTriangle />
        Warning with Icon
      </Button>
      <Button 
        variant="secondary"
        onClick={() => toast.info('Information', {
          icon: <Info className="h-4 w-4" />
        })}
      >
        <Info />
        Info with Icon
      </Button>
    </div>
  ),
};

export const ToastWithActions: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => toast('File uploaded successfully!', {
        action: {
          label: 'View',
          onClick: () => alert('Opening file...'),
        },
      })}>
        Toast with Action
      </Button>
      <Button 
        variant="outline"
        onClick={() => toast.error('Failed to delete item', {
          action: {
            label: 'Retry',
            onClick: () => toast.success('Retrying...'),
          },
        })}
      >
        Error with Retry
      </Button>
      <Button 
        variant="secondary"
        onClick={() => toast('New message received', {
          action: {
            label: 'Reply',
            onClick: () => toast.info('Opening chat...'),
          },
        })}
      >
        Message with Reply
      </Button>
    </div>
  ),
};

export const ToastWithDescription: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => toast('Profile Updated', {
        description: 'Your profile information has been saved successfully.',
      })}>
        With Description
      </Button>
      <Button 
        variant="outline"
        onClick={() => toast.success('Email Sent', {
          description: 'Your message has been delivered to john@example.com',
        })}
      >
        Success with Details
      </Button>
      <Button 
        variant="destructive"
        onClick={() => toast.error('Upload Failed', {
          description: 'The file size exceeds the 10MB limit. Please try a smaller file.',
        })}
      >
        Error with Details
      </Button>
    </div>
  ),
};

export const CustomDurations: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => toast('Quick message', { duration: 1000 })}>
        1 Second
      </Button>
      <Button 
        variant="secondary"
        onClick={() => toast('Normal message', { duration: 4000 })}
      >
        4 Seconds (Default)
      </Button>
      <Button 
        variant="outline"
        onClick={() => toast('Long message', { duration: 10000 })}
      >
        10 Seconds
      </Button>
      <Button 
        variant="destructive"
        onClick={() => toast.error('Critical error - requires action', { 
          duration: Infinity 
        })}
      >
        Persistent Toast
      </Button>
    </div>
  ),
};

export const LoadingToast: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => {
        const id = toast.loading('Uploading file...');
        setTimeout(() => {
          toast.success('File uploaded successfully!', { id });
        }, 3000);
      }}>
        Loading → Success
      </Button>
      <Button 
        variant="outline"
        onClick={() => {
          const id = toast.loading('Processing data...');
          setTimeout(() => {
            toast.error('Processing failed', { id });
          }, 3000);
        }}
      >
        Loading → Error
      </Button>
      <Button 
        variant="secondary"
        onClick={() => {
          const id = toast.loading('Connecting to server...');
          setTimeout(() => {
            toast.info('Connection established', { id });
          }, 2000);
        }}
      >
        Loading → Info
      </Button>
    </div>
  ),
};

export const PromiseToast: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => {
        const promise = new Promise((resolve) => {
          setTimeout(() => resolve({ message: 'Data saved!' }), 2000);
        });
        
        toast.promise(promise, {
          loading: 'Saving data...',
          success: 'Data saved successfully!',
          error: 'Failed to save data',
        });
      }}>
        Promise Success
      </Button>
      <Button 
        variant="destructive"
        onClick={() => {
          const promise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Network error')), 2000);
          });
          
          toast.promise(promise, {
            loading: 'Connecting...',
            success: 'Connected!',
            error: 'Connection failed',
          });
        }}
      >
        Promise Error
      </Button>
    </div>
  ),
};

export const ComplexToasts: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => toast.success('Download completed!', {
        description: 'Your file has been downloaded to the Downloads folder.',
        icon: <Download className="h-4 w-4" />,
        action: {
          label: 'Open Folder',
          onClick: () => toast.info('Opening Downloads folder...'),
        },
        duration: 6000,
      })}>
        <Download />
        Download Complete
      </Button>
      
      <Button 
        variant="outline"
        onClick={() => toast('Settings updated', {
          description: 'Your preferences have been saved and will take effect immediately.',
          icon: <Settings className="h-4 w-4" />,
          action: {
            label: 'View Settings',
            onClick: () => toast.info('Opening settings panel...'),
          },
        })}
      >
        <Settings />
        Settings Update
      </Button>
      
      <Button 
        variant="secondary"
        onClick={() => toast('You have a new follower!', {
          description: 'Sarah Johnson started following you.',
          icon: <Heart className="h-4 w-4 text-red-500" />,
          action: {
            label: 'View Profile',
            onClick: () => toast.info('Opening profile...'),
          },
        })}
      >
        <Heart />
        New Follower
      </Button>
    </div>
  ),
};

export const DismissToasts: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button onClick={() => {
        for (let i = 0; i < 5; i++) {
          toast(`Toast ${i + 1}`, { duration: 10000 });
        }
      }}>
        Create Multiple Toasts
      </Button>
      <Button 
        variant="destructive"
        onClick={() => toast.dismiss()}
      >
        Dismiss All Toasts
      </Button>
    </div>
  ),
};

export const CustomPosition: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="text-center text-sm text-gray-600 mb-4">
        Note: Position changes require a new Toaster instance
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        <Button onClick={() => toast('Top Left Toast')}>
          Default Position
        </Button>
        <Button 
          variant="outline"
          onClick={() => toast.success('This toast appears in the default position')}
        >
          Show Toast
        </Button>
      </div>
    </div>
  ),
};
