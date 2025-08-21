import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Switch } from './switch';

const meta: Meta<typeof Switch> = {
  title: 'UI/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    checked: {
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
  render: (args) => {
    const [checked, setChecked] = useState(false);
    return (
      <Switch
        {...args}
        checked={checked}
        onCheckedChange={setChecked}
      />
    );
  },
};

export const Checked: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(true);
    return (
      <Switch
        {...args}
        checked={checked}
        onCheckedChange={setChecked}
      />
    );
  },
};

export const Sizes: Story = {
  render: () => {
    const [checked1, setChecked1] = useState(false);
    const [checked2, setChecked2] = useState(true);
    const [checked3, setChecked3] = useState(false);
    
    return (
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <Switch
            size="sm"
            checked={checked1}
            onCheckedChange={setChecked1}
          />
          <label className="text-xs text-gray-600">Small</label>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Switch
            size="md"
            checked={checked2}
            onCheckedChange={setChecked2}
          />
          <label className="text-xs text-gray-600">Medium</label>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Switch
            size="lg"
            checked={checked3}
            onCheckedChange={setChecked3}
          />
          <label className="text-xs text-gray-600">Large</label>
        </div>
      </div>
    );
  },
};

export const WithLabels: Story = {
  render: () => {
    const [notifications, setNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(false);
    const [autoSave, setAutoSave] = useState(true);
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between w-64">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Notifications</span>
            <span className="text-xs text-gray-500">Receive push notifications</span>
          </div>
          <Switch
            checked={notifications}
            onCheckedChange={setNotifications}
          />
        </div>
        
        <div className="flex items-center justify-between w-64">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Dark Mode</span>
            <span className="text-xs text-gray-500">Enable dark theme</span>
          </div>
          <Switch
            checked={darkMode}
            onCheckedChange={setDarkMode}
          />
        </div>
        
        <div className="flex items-center justify-between w-64">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Auto Save</span>
            <span className="text-xs text-gray-500">Automatically save changes</span>
          </div>
          <Switch
            checked={autoSave}
            onCheckedChange={setAutoSave}
          />
        </div>
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="flex gap-6">
      <div className="flex flex-col items-center gap-2">
        <Switch disabled checked={false} onCheckedChange={() => {}} />
        <label className="text-xs text-gray-600">Disabled Off</label>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Switch disabled checked={true} onCheckedChange={() => {}} />
        <label className="text-xs text-gray-600">Disabled On</label>
      </div>
    </div>
  ),
};

export const AllSizesWithStates: Story = {
  render: () => {
    const [states, setStates] = useState({
      sm_off: false,
      sm_on: true,
      md_off: false,
      md_on: true,
      lg_off: false,
      lg_on: true,
    });
    
    const updateState = (key: string, value: boolean) => {
      setStates(prev => ({ ...prev, [key]: value }));
    };
    
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-3">Small</h3>
          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-2">
              <Switch
                size="sm"
                checked={states.sm_off}
                onCheckedChange={(value) => updateState('sm_off', value)}
              />
              <span className="text-xs">Interactive</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch
                size="sm"
                checked={states.sm_on}
                onCheckedChange={(value) => updateState('sm_on', value)}
              />
              <span className="text-xs">Interactive</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch size="sm" disabled checked={false} onCheckedChange={() => {}} />
              <span className="text-xs">Disabled</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch size="sm" disabled checked={true} onCheckedChange={() => {}} />
              <span className="text-xs">Disabled</span>
            </div>
          </div>
        </div>
        
        <div>
          <h3 className="text-sm font-medium mb-3">Medium</h3>
          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-2">
              <Switch
                size="md"
                checked={states.md_off}
                onCheckedChange={(value) => updateState('md_off', value)}
              />
              <span className="text-xs">Interactive</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch
                size="md"
                checked={states.md_on}
                onCheckedChange={(value) => updateState('md_on', value)}
              />
              <span className="text-xs">Interactive</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch size="md" disabled checked={false} onCheckedChange={() => {}} />
              <span className="text-xs">Disabled</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch size="md" disabled checked={true} onCheckedChange={() => {}} />
              <span className="text-xs">Disabled</span>
            </div>
          </div>
        </div>
        
        <div>
          <h3 className="text-sm font-medium mb-3">Large</h3>
          <div className="flex gap-4">
            <div className="flex flex-col items-center gap-2">
              <Switch
                size="lg"
                checked={states.lg_off}
                onCheckedChange={(value) => updateState('lg_off', value)}
              />
              <span className="text-xs">Interactive</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch
                size="lg"
                checked={states.lg_on}
                onCheckedChange={(value) => updateState('lg_on', value)}
              />
              <span className="text-xs">Interactive</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch size="lg" disabled checked={false} onCheckedChange={() => {}} />
              <span className="text-xs">Disabled</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Switch size="lg" disabled checked={true} onCheckedChange={() => {}} />
              <span className="text-xs">Disabled</span>
            </div>
          </div>
        </div>
      </div>
    );
  },
};

export const FormExample: Story = {
  render: () => {
    const [formData, setFormData] = useState({
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: true,
      marketingEmails: false,
      privacyMode: false,
    });
    
    const updateForm = (key: string, value: boolean) => {
      setFormData(prev => ({ ...prev, [key]: value }));
    };
    
    return (
      <div className="max-w-md space-y-6">
        <h3 className="text-lg font-semibold">Notification Preferences</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Email Notifications</div>
              <div className="text-xs text-gray-500">Get notified about important updates</div>
            </div>
            <Switch
              checked={formData.emailNotifications}
              onCheckedChange={(value) => updateForm('emailNotifications', value)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">SMS Notifications</div>
              <div className="text-xs text-gray-500">Receive urgent alerts via SMS</div>
            </div>
            <Switch
              checked={formData.smsNotifications}
              onCheckedChange={(value) => updateForm('smsNotifications', value)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Push Notifications</div>
              <div className="text-xs text-gray-500">Browser push notifications</div>
            </div>
            <Switch
              checked={formData.pushNotifications}
              onCheckedChange={(value) => updateForm('pushNotifications', value)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Marketing Emails</div>
              <div className="text-xs text-gray-500">Product updates and offers</div>
            </div>
            <Switch
              checked={formData.marketingEmails}
              onCheckedChange={(value) => updateForm('marketingEmails', value)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Privacy Mode</div>
              <div className="text-xs text-gray-500">Hide your online status</div>
            </div>
            <Switch
              checked={formData.privacyMode}
              onCheckedChange={(value) => updateForm('privacyMode', value)}
            />
          </div>
        </div>
        
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium mb-2">Current Settings:</h4>
          <pre className="text-xs bg-gray-100 p-2 rounded">
            {JSON.stringify(formData, null, 2)}
          </pre>
        </div>
      </div>
    );
  },
};
