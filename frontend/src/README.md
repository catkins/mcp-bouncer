# MCP Bouncer Frontend - Component Architecture

This document describes the refactored component architecture for the MCP Bouncer frontend application.

## Directory Structure

```
src/
├── components/           # Reusable UI components
│   ├── index.ts         # Component exports
│   ├── Header.tsx       # Fixed header with app icon
│   ├── StatusIndicator.tsx
│   ├── ListenAddress.tsx
│   ├── ServerCard.tsx
│   ├── ServerList.tsx
│   └── ServerForm.tsx
├── hooks/               # Custom React hooks
│   └── useMCPService.ts
├── App.tsx             # Main application component
└── main.tsx            # Application entry point
```

## Components

### Header
Fixed header component that displays the app icon, title, and status indicator at the top of the window.

**Props:**
- `isActive: boolean | null` - The current status of the MCP service

### StatusIndicator
Displays the active/inactive status of the MCP service with appropriate icons and loading states.

**Props:**
- `isActive: boolean | null` - The current status of the MCP service

### ListenAddress
Shows the MCP listen address with copy-to-clipboard functionality and auto-start status.

**Props:**
- `mcpUrl: string` - The MCP service URL
- `settings: Settings | null` - Application settings

### ServerCard
Displays individual MCP server information in a card format with edit/delete actions.

**Props:**
- `server: MCPServerConfig` - Server configuration
- `index: number` - Server index
- `onEdit: (server: MCPServerConfig) => void` - Edit callback
- `onRemove: (serverName: string) => Promise<void>` - Remove callback

### ServerList
Manages the list of MCP servers with add server functionality and empty state.

**Props:**
- `servers: MCPServerConfig[]` - Array of server configurations
- `onAddServer: () => void` - Add server callback
- `onEditServer: (server: MCPServerConfig) => void` - Edit server callback
- `onRemoveServer: (serverName: string) => Promise<void>` - Remove server callback

### ServerForm
Modal form for adding and editing MCP server configurations.

**Props:**
- `server?: MCPServerConfig | null` - Server to edit (null for new server)
- `onSave: (server: MCPServerConfig) => Promise<void>` - Save callback
- `onCancel: () => void` - Cancel callback

## Hooks

### useMCPService
Custom hook that manages all MCP service state and operations.

**Returns:**
- `servers: MCPServerConfig[]` - List of servers
- `settings: Settings | null` - Application settings
- `mcpUrl: string` - MCP service URL
- `isActive: boolean | null` - Service status
- `addServer: (config: MCPServerConfig) => Promise<void>` - Add server
- `updateServer: (name: string, config: MCPServerConfig) => Promise<void>` - Update server
- `removeServer: (name: string) => Promise<void>` - Remove server
- Additional utility functions for loading data

## Benefits of This Architecture

1. **Separation of Concerns**: Each component has a single responsibility
2. **Reusability**: Components can be easily reused across the application
3. **Maintainability**: Smaller, focused components are easier to maintain
4. **Testability**: Individual components can be tested in isolation
5. **State Management**: Custom hook centralizes all MCP service logic
6. **Type Safety**: Full TypeScript support with proper interfaces
7. **Fixed Header**: Header stays visible while scrolling for better UX

## Usage Example

```tsx
import { useMCPService } from './hooks/useMCPService'
import { Header, ListenAddress, ServerList } from './components'

function App() {
  const { servers, settings, mcpUrl, isActive, addServer, updateServer, removeServer } = useMCPService()
  
  return (
    <div className="h-screen bg-white">
      <Header isActive={isActive} />
      <main className="pt-20 px-6 pb-6">
        <ListenAddress mcpUrl={mcpUrl} settings={settings} />
        <ServerList 
          servers={servers}
          onAddServer={() => {/* handle add */}}
          onEditServer={(server) => {/* handle edit */}}
          onRemoveServer={removeServer}
        />
      </main>
    </div>
  )
}
```
