# MCP Bouncer

A desktop application that serves as a gateway and management interface for Model Context Protocol (MCP) servers. Built with Wails3, it provides a modern, cross-platform GUI for configuring, managing, and monitoring MCP servers with support for multiple transport protocols.

> **⚠️ Early Development Software**  
> This project is in early development and may have bugs, incomplete features, or breaking changes. Use at your own risk and please report any issues you encounter.

## What is MCP Bouncer?

MCP Bouncer acts as a centralized hub for managing Model Context Protocol servers. It allows you to:

- **Configure multiple MCP servers** with different transport protocols (stdio, SSE, HTTP)
- **Start/stop servers** individually or all at once
- **Monitor server status** and connection health in real-time
- **Persist configurations** across application restarts
- **Manage environment variables** and command-line arguments for each server

## Features

### 🚀 Server Management
- Add, edit, and remove MCP server configurations
- Enable/disable servers individually
- Bulk start/stop operations
- Real-time status monitoring with connection health indicators

### 🔧 Transport Protocol Support
- **stdio**: Traditional process-based transport for local MCP servers
- **SSE**: Server-Sent Events for HTTP-based streaming
- **Streamable HTTP**: HTTP-based transport with streaming capabilities

### 🎨 Modern UI
- Clean, responsive interface built with React and Tailwind CSS
- Dark/light theme support
- Toast notifications for user feedback
- Compact, efficient layout design

### ⚙️ Configuration Management
- Automatic settings persistence in platform-specific locations
- JSON-based configuration format
- Easy access to configuration directory
- Environment variable management per server

### 🔌 MCP Client Integration
- Built-in MCP client for testing server connections
- Real-time connection status updates
- Error reporting and debugging information

## Quick Start

### Prerequisites
- Go 1.24.0 or later
- Node.js 18+ (for frontend development)
- Wails3 CLI: `go install github.com/wailsapp/wails/v3/cmd/wails@latest`

### Development
1. Clone the repository:
   ```bash
   git clone https://github.com/catkins/mcp-bouncer.git
   cd mcp-bouncer
   ```

2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

3. Run in development mode:
   ```bash
   wails3 dev
   ```

### Building
```bash
# Build for production
wails3 build

# Build for development (unminified)
cd frontend && npm run build:dev && cd ..
wails3 build
```

## Configuration

### Settings Location
The application automatically manages settings in platform-specific locations:

- **macOS**: `~/Library/Application Support/mcp-bouncer/settings.json`
- **Linux**: `~/.config/mcp-bouncer/settings.json`
- **Windows**: `%APPDATA%\mcp-bouncer\settings.json`

### Configuration Format

```json
{
  "mcp_servers": [
    {
      "name": "filesystem",
      "description": "Filesystem MCP server for file operations",
      "transport": "stdio",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"],
      "env": {
        "MCP_FILESYSTEM_ROOT": "/Users/username/Documents"
      },
      "enabled": true
    },
    {
      "name": "remote-server",
      "description": "Remote MCP server using HTTP transport",
      "transport": "streamable_http",
      "endpoint": "https://example.com/mcp/stream",
      "headers": {
        "Authorization": "Bearer your-token-here"
      },
      "enabled": false
    }
  ],
  "listen_addr": "localhost:8091",
  "auto_start": false
}
```

### Server Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier for the server |
| `description` | string | No | Human-readable description |
| `transport` | string | Yes | Transport type: `stdio`, `sse`, or `streamable_http` |
| `command` | string | For `stdio` | Command to execute |
| `args` | array | For `stdio` | Command-line arguments |
| `env` | object | No | Environment variables |
| `endpoint` | string | For HTTP | HTTP endpoint URL |
| `headers` | object | For HTTP | HTTP headers |
| `enabled` | boolean | No | Auto-start on application launch |

## Project Structure

```
mcp-bouncer/
├── frontend/                 # React + TypeScript frontend
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── hooks/           # Custom React hooks
│   │   └── contexts/        # React contexts
│   └── package.json
├── pkg/services/
│   ├── mcp/                 # MCP server management
│   └── settings/            # Configuration management
├── main.go                  # Application entry point
└── settings.example.json    # Example configuration
```

## Usage Examples

### Adding a Filesystem MCP Server
1. Click "Add Server" in the UI
2. Configure with:
   - Name: `filesystem`
   - Transport: `stdio`
   - Command: `npx`
   - Args: `["@modelcontextprotocol/server-filesystem"]`
   - Environment: `{"MCP_FILESYSTEM_ROOT": "/path/to/root"}`

### Adding a Remote HTTP Server
1. Click "Add Server" in the UI
2. Configure with:
   - Name: `remote-api`
   - Transport: `streamable_http`
   - Endpoint: `https://api.example.com/mcp/stream`
   - Headers: `{"Authorization": "Bearer your-token"}`

## Development

### Architecture
- **Backend**: Go with Wails3 framework
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4
- **MCP Integration**: Uses `mark3labs/mcp-go` for MCP protocol handling
- **Settings**: JSON-based configuration with automatic persistence

### Key Components
- `MCPService`: Manages MCP server lifecycle and connections
- `SettingsService`: Handles configuration persistence
- `ServerList`: Main UI component for server management
- `useMCPService`: React hook for MCP service integration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Related Links

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Wails3 Documentation](https://v3.wails.io/)
- [MCP Go Library](https://github.com/mark3labs/mcp-go)
