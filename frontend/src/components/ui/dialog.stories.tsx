import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from './dialog';
import { Button } from './button';
import { Trash2, Settings, Info, AlertTriangle } from 'lucide-react';

const meta: Meta<typeof Dialog> = {
  title: 'UI/Dialog',
  component: Dialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>
            This is a basic dialog with title and description.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>This is the main content of the dialog.</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open Dialog (No X)</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>No Close Button</DialogTitle>
          <DialogDescription>
            This dialog doesn't have the X button in the top right.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p>You must use the buttons below to close this dialog.</p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const ConfirmationDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 />
          Delete Item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-red-500" />
            Are you sure?
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the item
            and remove it from our servers.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const SettingsDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your account settings and preferences.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Display Name</label>
            <input
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter your name"
              defaultValue="John Doe"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <input
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter your email"
              defaultValue="john@example.com"
            />
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="notifications" defaultChecked />
            <label htmlFor="notifications" className="text-sm">
              Enable notifications
            </label>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const InfoDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Info />
          About
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="text-blue-500" />
            About This App
          </DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-3">
          <p><strong>Version:</strong> 1.0.0</p>
          <p><strong>Build:</strong> 2024.01.15</p>
          <p><strong>License:</strong> MIT</p>
          <p className="text-sm text-gray-600">
            This application is built with React, TypeScript, and Tailwind CSS.
            It demonstrates various UI components and patterns.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const ControlledDialog: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={() => setOpen(true)}>Open Dialog</Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={!open}>
            Close Dialog
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          Dialog is currently: {open ? 'Open' : 'Closed'}
        </p>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Controlled Dialog</DialogTitle>
              <DialogDescription>
                This dialog's state is controlled by external buttons.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p>You can close this dialog using the external button or the close button.</p>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
};

export const LongContentDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Long Content</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terms and Conditions</DialogTitle>
          <DialogDescription>
            Please read through our terms and conditions.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4 text-sm">
          {Array.from({ length: 20 }, (_, i) => (
            <p key={i}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
              tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
              veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea
              commodo consequat. Section {i + 1}.
            </p>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Decline</Button>
          </DialogClose>
          <Button>Accept</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
