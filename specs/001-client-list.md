# Feature Spec: Clients Page and Incoming Client List

## Summary
Add a new Clients page to the desktop UI that lists all clients currently connected to MCP Bouncer's Streamable HTTP endpoint (http://localhost:8091/mcp). Each connected client should be presented in a card similar in style to ServerCard, showing key information from the client's Initialize call: client name, version, optional title, and the time the connection was established (connected at).

## Goals
- Provide visibility into all active incoming MCP client connections to MCP Bouncer
- Display per-client metadata sourced from the MCP Initialize request
- Live updates: entries appear on connect and disappear on disconnect without manual refresh
- Keep the current Servers page intact and accessible via a simple two-page layout (Servers, Clients)

## Non-Goals
- Persisting client session history beyond the active connection
- Deep inspection of capabilities or tools exposed by incoming clients
- Managing or controlling incoming clients from the UI

---

## UX
- App has two top-level pages: Servers and Clients
  - Servers: existing page showing configured outbound MCP servers
  - Clients: new page showing currently connected incoming clients
- Navigation: add a simple two-tab segmented control or pills under the header to switch between Servers and Clients
- Clients Page
  - Grid/list of ClientCard components
  - ClientCard fields
    - Name (required)
    - Version (required)
    - Title (optional; hide if missing)
    - Connected at (relative time and tooltip with absolute time)
  - Empty state: “No clients are currently connected.”

Styling should match the existing Tailwind design and align with ServerCard spacing, elevation, and typography.

---

## Data Model and API

### Backend (Go)
Track incoming MCP client sessions on the server side (the "reverse" direction vs. configured outbound clients):

- New type
  - IncomingClient
    - ID string (unique per connection/session)
    - Name string
    - Version string
    - Title string (optional)
    - ConnectedAt time.Time

- Server-side registry
  - Add IncomingClientRegistry to pkg/services/mcp/server.go (or a new file) that records active sessions
  - Hook into MCP server lifecycle to capture Initialize request from incoming clients:
    - On new session/Initialize, extract clientInfo.name, clientInfo.version, and optional title if available; create an IncomingClient entry with ConnectedAt = now; emit event
    - On disconnect/transport close, remove the entry; emit event

- Service methods (pkg/services/mcp/service.go)
  - func (s *MCPService) GetIncomingClients() []IncomingClient
  - Events emitted through the existing event bridge:
    - "mcp:incoming_client_connected" { id, name, version, title, connected_at }
    - "mcp:incoming_client_disconnected" { id }
    - "mcp:incoming_clients_updated" (general list-changed fallback)

- Bindings
  - After implementing the above, run: wails3 generate bindings -ts
  - This will create/update TS bindings under frontend/bindings

Notes
- mark3labs/mcp-go server should expose enough hooks to intercept Initialize and track sessions. If not directly available, wrap the transport handler or add a custom handler in server setup to observe Initialize calls and connection lifecycle. The registry should be concurrency-safe.

### Frontend (TypeScript)
- Types (generated)
  - IncomingClient: { id: string; name: string; version: string; title?: string; connected_at: string }

- Service API (bindings)
  - MCPService.GetIncomingClients(): Promise<IncomingClient[]>

- Events (via Wails Events)
  - mcp:incoming_client_connected
  - mcp:incoming_client_disconnected
  - mcp:incoming_clients_updated

---

## Frontend Implementation

- Navigation in App
  - Add a lightweight page switcher in AppContent (Servers | Clients)
  - Persist selected tab in component state; default to Servers

- New components
  - ClientCard
    - Props: { client: IncomingClient }
    - Layout: mirror ServerCard visuals; show name, optional title subdued, version badge, connected-at time
  - ClientList
    - Fetch initial list via MCPService.GetIncomingClients on mount
    - Subscribe to incoming client events and update local state accordingly
    - Render grid of ClientCard; handle empty state

- Hooks
  - Option A: extend useMCPService with incoming clients state and event subscriptions
  - Option B: new useIncomingClients hook to isolate concerns (preferred for separation)
    - State: clients: IncomingClient[]
    - Methods: reload(), subscribe/unsubscribe handled internally

- Time formatting
  - Use existing project utilities/patterns if any; otherwise format with Intl.DateTimeFormat and a simple relative helper without new deps

---

## Backend Implementation Details

- Incoming client tracking
  - Create a thread-safe registry on the Server instance
  - On Initialize: construct IncomingClient and store by a generated session ID
  - On connection close: delete by session ID
  - Emit events via Server.EmitEvent -> MCPService.emitEvent bridge

- Data extraction from Initialize
  - From mcp.InitializeRequest.Params.ClientInfo: Name, Version
  - Title: include if provided by client; if not available in clientInfo, leave empty

- Service API
  - MCPService.GetIncomingClients() reads from server registry and returns []IncomingClient

---

## Edge Cases
- Multiple connections from the same client name/version: show each as a separate card (different IDs)
- Missing title: omit the subtitle line
- Very short-lived connections: cards may briefly appear/disappear; this is acceptable and expected

---

## Acceptance Criteria
- A Clients tab is available next to Servers; switching tabs is instantaneous
- When a new MCP client connects and completes Initialize, it appears in the Clients list with correct name, version, and connected-at timestamp; title appears when provided
- When a client disconnects, its card is removed within a second
- Refreshing the app shows the current set of connected clients accurately
- No regressions to Servers page functionality

---

## Test Plan
- Manual
  - Run: wails3 dev
  - Connect a sample MCP client to http://localhost:8091/mcp; verify card appears
  - Connect multiple clients; verify multiple cards
  - Disconnect clients; verify removal
  - Verify dark/light themes look correct
- Storybook
  - Add ClientCard stories with: title present, no title, long names
- Backend
  - Verify events are emitted on connect/disconnect; verify GetIncomingClients returns the same list shown in the UI

---

## Work Breakdown

1) Backend
- Add IncomingClient type and concurrency-safe registry on Server
- Wire into mcp-go server to observe Initialize and track sessions
- Emit incoming client events on connect/disconnect
- Expose MCPService.GetIncomingClients()
- Generate Wails bindings

2) Frontend
- Add page switcher (Servers | Clients) in AppContent
- Implement ClientCard and ClientList components
- Implement useIncomingClients hook, subscribe to incoming client events, and wire to ClientList
- Integrate Clients page into App
- Add Storybook stories for ClientCard

3) Polish
- Time formatting utility and tooltip
- Empty state visuals

---

## Commands
- Dev: wails3 dev
- Generate bindings after backend changes: wails3 generate bindings -ts
- Frontend build (dev): npm run --prefix frontend build:dev
- Format: task format