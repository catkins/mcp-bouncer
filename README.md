# MCP Bouncer

A Wails3 application that serves as a gateway for Model Context Protocol (MCP) servers. This application provides a user-friendly interface for managing and configuring MCP servers.

## Features

- **MCP Server Management**: Add, remove, and configure MCP servers
- **Settings Persistence**: Automatic settings management with JSON configuration files
- **Cross-platform**: Works on macOS, Windows, and Linux
- **Modern UI**: Built with Wails3 and modern web technologies

## Getting Started

## Getting Started

1. Navigate to your project directory in the terminal.

2. To run your application in development mode, use the following command:

   ```
   wails3 dev
   ```

   This will start your application and enable hot-reloading for both frontend and backend changes.

3. To build your application for production, use:

   ```
   wails3 build
   ```

   This will create a production-ready executable in the `build` directory.

## Exploring Wails3 Features

Now that you have your project set up, it's time to explore the features that Wails3 offers:

1. **Check out the examples**: The best way to learn is by example. Visit the `examples` directory in the `v3/examples` directory to see various sample applications.

2. **Run an example**: To run any of the examples, navigate to the example's directory and use:

   ```
   go run .
   ```

   Note: Some examples may be under development during the alpha phase.

3. **Explore the documentation**: Visit the [Wails3 documentation](https://v3.wails.io/) for in-depth guides and API references.

4. **Join the community**: Have questions or want to share your progress? Join the [Wails Discord](https://discord.gg/JDdSxwjhGf) or visit the [Wails discussions on GitHub](https://github.com/wailsapp/wails/discussions).

## Configuration

The application automatically manages settings in a JSON configuration file. The settings file is located at:

- **macOS**: `~/Library/Application Support/mcp-bouncer/settings.json`
- **Linux**: `~/.config/mcp-bouncer/settings.json`
- **Windows**: `%APPDATA%\mcp-bouncer\settings.json`

### Settings Structure

The settings file contains the following configuration:

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

### MCP Server Configuration

Each MCP server configuration includes:

- **name**: Unique identifier for the server
- **description**: Human-readable description
- **transport**: Transport type (`stdio`, `sse`, or `streamable_http`)
- **command**: The command to execute (required for `stdio` transport)
- **args**: Array of command-line arguments (for `stdio` transport)
- **env**: Environment variables as key-value pairs (for `stdio` transport)
- **endpoint**: HTTP endpoint URL (required for `sse` and `streamable_http` transports)
- **headers**: HTTP headers as key-value pairs (for `sse` and `streamable_http` transports)
- **enabled**: Whether the server should be started automatically

#### Transport Types

- **stdio**: Traditional process-based transport using standard input/output
- **sse**: Server-Sent Events transport for HTTP-based MCP servers
- **streamable_http**: Streamable HTTP transport for HTTP-based MCP servers

## Project Structure

- `frontend/`: Contains your frontend code (HTML, CSS, JavaScript/TypeScript)
- `main.go`: The entry point of your Go backend
- `pkg/services/mcp/`: MCP server management service
- `pkg/services/settings/`: Settings management service
- `settings.example.json`: Example configuration file

## Next Steps

1. Modify the frontend in the `frontend/` directory to create your desired UI.
2. Add backend functionality in `main.go`.
3. Use `wails3 dev` to see your changes in real-time.
4. When ready, build your application with `wails3 build`.

Happy coding with Wails3! If you encounter any issues or have questions, don't hesitate to consult the documentation or reach out to the Wails community.
