import type { Meta, StoryObj } from '@storybook/react';
import { SettingsModal } from './SettingsModal';

const baseSettings = {
  listen_addr: 'http://127.0.0.1:8091/mcp',
  transport: 'streamable_http' as const,
  mcp_servers: [],
};

const meta: Meta<typeof SettingsModal> = {
  title: 'Components/Settings/SettingsModal',
  component: SettingsModal,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    isOpen: true,
    settings: baseSettings,
    settingsPath: '/Users/me/Library/Application Support/app.mcp.bouncer/settings.json',
    socketBridgePath: { path: '/tmp/mcp-bouncer-socket-bridge', exists: true },
  },
  argTypes: {
    onSave: { action: 'save' },
    onClose: { action: 'close' },
    onOpenDirectory: { action: 'openDirectory' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const UnixTransport: Story = {
  args: {
    settings: { ...baseSettings, transport: 'unix' },
  },
};
