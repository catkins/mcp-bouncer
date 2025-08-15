# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Primary Development
- **Development mode**: `wails3 dev` or `task dev` - Runs with hot reload for both frontend and backend
- **Build production**: `wails3 build` or `task build` - Creates production executable in `build/` directory
- **Run built app**: `task run` - Runs the built application

### Frontend Development
- **Frontend build (dev)**: `cd frontend && npm run build:dev` - TypeScript compilation with dev settings
- **Frontend build (prod)**: `cd frontend && npm run build` - Optimized production build
- **Frontend dev server**: `cd frontend && npm run dev` - Standalone Vite dev server
- **Format code**: `task format` - Formats all TypeScript code with Prettier
- **Check formatting**: `task format:check` - Checks if code is properly formatted

### Task Runner
The project uses Taskfile (Task) as the build system. Use `task --list` to see all available tasks.

## Architecture Overview

### Application Structure
This is a **Wails 3 application** that creates a desktop app combining Go backend services with a TypeScript/HTML frontend.

**Main Components:**
- `main.go`: Application entry point that initializes Wails app and MCP service
- `pkg/services/mcp/`: Go service layer containing MCP server functionality
- `frontend/`: Web-based UI built with TypeScript and vanilla HTML/CSS

After making changes in `pkg/services` regenerate bindings with `wails3 generate bindings`

### MCP Service Architecture
The core functionality revolves around an **MCP (Model Context Protocol) service**:

**Backend (`pkg/services/mcp/server.go`):**
- `MCPService`: Main service struct that manages MCP server connections
- Runs as a background goroutine emitting periodic events
- Exposes methods `List()` and `ListenAddr()` to frontend via Wails bindings
- Currently generates mock server data but designed to proxy real MCP servers

**Frontend (`frontend/src/main.ts`):**
- Imports auto-generated Go service bindings from `bindings/` directory  
- Listens for `mcp:servers_updated` events to refresh server list dynamically
- Simple DOM manipulation to display server information

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
This appears to be a **proof-of-concept for an MCP bouncer/proxy** - a local gateway that can manage and route requests to multiple MCP servers. The current implementation shows the foundation with mock data.

### File Structure Patterns
- Go services follow `pkg/services/{service-name}/` pattern
- Wails auto-generates TypeScript bindings in `frontend/bindings/`
- Build artifacts go to `build/` and `bin/` directories

### No Testing Framework
The project currently has no test files or testing framework configured.