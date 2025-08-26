# CLAUDE.md

This file provides guidance to coding agents when working with code in this repository.

## Development Commands

### Go backend development Development
- **Development mode**: `wails3 dev` or `task dev` - Runs with hot reload for both frontend and backend, and starts storybook on. This is blocking.
  - **Note**: `wails3 dev` must be run in a background process (eg. in a tmux session)
- **Build production**: `wails3 build` or `task build` - Creates production executable in `build/` directory
- **Run built app**: `task run` - Runs the built application. This is blocking.
- **Go Type Documentation**: Use `go doc <package or type>` to understand Go types and APIs when debugging or working with unfamiliar code.
- **Format code**: `task format` - Formats all TypeScript and Go code with Prettier and Go fmt

IMPORTANT: Blocking commands MUST be run in a background agent, or in a tmux pane.

### Frontend Development
- **Frontend build (dev)**: `npm run --prefix frontend build:dev` - TypeScript compilation with dev settings
- **Frontend build (prod)**: `npm run --prefix frontend build` - Optimized production build
- **Format code**: `task format` - Formats all TypeScript code with Prettier
- **Check formatting**: `task format:check` - Checks if code is properly formatted

### Task Runner
The project uses Taskfile (Task) as the build system. Use `task --list` to see all available tasks.

## Architecture Overview

### Application Structure
This is a **[Wails 3](https://github.com/wailsapp/wails/tree/v3-alpha) application** that creates a desktop app combining Go backend services with a TypeScript/HTML frontend.

**Main Components:**

- `main.go`: Application entry point that initializes Wails app and MCP service
- `pkg/services/mcp/`: Go service layer containing MCP server/client functionality
- `pkg/services/settings/`: Go service layer managing settings
- `frontend/`: Web-based UI built with TypeScript and vanilla HTML/CSS
- After making changes in `pkg/services` regenerate bindings with `wails3 generate bindings -ts` which will update generated code in `frontend/bindings`

**Frontend:**

- Imports auto-generated Go service bindings from `bindings/` directory
- React frontend using Vite for builds
- Tailwind CSS 4 is used for styling
- Storybook for component development and testing
  - When `wails3 dev` is running, Storybook is automatically started and accessible at `http://localhost:6006`
  - Use the playwright MCP browser tools to interact with components in the Storybook UI

### Key Integration Points
1. **Service Binding**: Go services are automatically bound to frontend via Wails
2. **Event System**: Backend emits custom events that frontend can listen to
3. **Asset Embedding**: Frontend dist files are embedded into Go binary using `go:embed`

### Configuration
- `build/config.yml`: Wails project configuration including app metadata and dev mode settings
- `Taskfile.yml`: Build task definitions with OS-specific includes
- Frontend config in `frontend/package.json` and `frontend/tsconfig.json`
- `frontend/.prettierrc.json`: Prettier formatting configuration for consistent code style

## Development Notes

### Project Purpose
- This is MCP Bouncer, a local gateway that can manage and route requests to multiple MCP servers.
- It exposes a Streamable HTTP MCP Server at http://localhost:8091/mcp, and proxies requests to configured MCP Servers
- Also tracks incoming MCP client sessions and surfaces them in the UI (Clients tab)
- It is configured in the UI, but configuration is saved in `$XDG_CONFIG_HOME/mcp-bouncer/settings.json`
- It supports STDIO, SSE and Streamable HTTP (including OAuth) MCP Servers

### File Structure Patterns
- Go services follow `pkg/services/{service-name}/` pattern
- Wails auto-generates TypeScript bindings in `frontend/bindings/`
- Build artifacts go to `build/` and `bin/` directories

### Other guidelines

**Git Commits**: Only create git commits when explicitly asked by the user. Do not automatically commit changes unless the user specifically requests it.
