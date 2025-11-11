# MCP Bouncer

A desktop gateway for **Model Context Protocol (MCP)** servers. MCP Bouncer runs a local MCP proxy, lets you manage upstream servers, and ships a UI for monitoring connections, debugging tool calls, and viewing JSON‑RPC logs. The app is built with **Tauri v2** (Rust backend + React frontend).

> **Status:** Early alpha. Expect sharp edges and breaking changes while the transport work settles.

---

## Requirements

- macOS, Linux, or Windows
- Node.js 18+ (for Vite + Tauri dev server)
- Rust stable toolchain (the backend targets `edition = 2024`)
- Tauri CLI (`npm i -g @tauri-apps/cli` or invoke via `npx tauri`)
- Linux only: install `keyutils` / `libkeyutils` so the keyring backend works

---

## Getting Started (Dev)

```bash
git clone https://github.com/catkins/mcp-bouncer.git
cd mcp-bouncer
npm install
npx tauri dev
```

`npx tauri dev` runs `npm run dev:tauri`, which first builds the Unix socket bridge helper (`mcp-bouncer-socket-bridge`) and then launches Vite + the Rust backend. The UI opens automatically once the helper and backend are ready.

---

## Building the Desktop App

```bash
# Build frontend + socket bridge + Tauri bundle
cargo tauri build

# Individual pieces
npm run build              # Frontend assets only
npm run build:bridge       # Debug bridge binary
npm run build:bridge:release
cargo build --manifest-path src-tauri/Cargo.toml --release
```

Release bundles are written under `src-tauri/target/release/`. Ship the main app together with the generated `mcp-bouncer-socket-bridge` when Unix transport support matters.

---

## Configuring MCP Servers

Settings live in `$XDG_CONFIG_HOME/app.mcp.bouncer/settings.json` (macOS: `~/Library/Application Support/...`, Windows: `%APPDATA%\app.mcp.bouncer\settings.json`). Use the **gear icon** in the header to open this directory from the UI.

Minimal example:

```jsonc
{
  "listen_addr": "http://127.0.0.1:8091/mcp",
  "transport": "streamable_http",    // streamable_http | unix
  "mcp_servers": [
    {
      "name": "local-http",
      "transport": "streamable_http",
      "endpoint": "http://127.0.0.1:8080/mcp",
      "enabled": true
    },
    {
      "name": "stdio-example",
      "transport": "stdio",
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "enabled": false
    }
  ]
}
```

Changes are picked up live; the UI also surfaces add/edit forms if you prefer not to edit JSON by hand.

---

## Proxy Transport Options

| Setting (`settings.transport`) | When to use | MCP URL shown in UI |
| ------------------------------ | ----------- | ------------------- |
| `streamable_http` (default)    | Simple localhost HTTP proxy over MCP's streamable HTTP transport | `http://127.0.0.1:8091/mcp` (or fallback port) |
| `unix` (macOS/Linux)           | You want to **keep the proxy off TCP** and only allow local processes with filesystem access to connect. Pair with the socket bridge for stdio-only clients. | `/tmp/mcp-bouncer.sock` |

Need stdio clients but prefer not to expose TCP? Switch to `unix` mode and run `mcp-bouncer-socket-bridge` so tools like `mcp-remote` can continue to connect via stdio pipes. The UI header and settings modal will always surface the exact helper path the app detects, so you can copy/paste it without guessing.

Selecting `unix` on unsupported platforms surfaces an explicit startup error. The persisted `listen_addr` field is legacy; the live value in the header always reflects the active transport.

---

## Unix Socket Bridge CLI

The helper binary `mcp-bouncer-socket-bridge` connects **stdio clients** (e.g., `mcp-remote`, MCP Inspector) to MCP Bouncer when it is running in Unix-socket mode. The bridge prevents random webpages or LAN hosts from poking at your MCP server because only the bridge process touches the filesystem socket.

### Build or locate the helper

- Dev: `npm run build:bridge` (already executed by `npx tauri dev`)
- Release: `npm run build:bridge:release` (already executed by `cargo tauri build`)

### Run the bridge

```bash
cargo run --manifest-path src-tauri/Cargo.toml \
  --bin mcp-bouncer-socket-bridge -- --socket /tmp/mcp-bouncer.sock --endpoint /mcp
```

Flags:

- `--socket` (default `/tmp/mcp-bouncer.sock`)
- `--endpoint` (default `/mcp`)

If you stick with the defaults you can omit the flags entirely; they’re shown above and in the settings panel to make the contract explicit when you do need to customize paths.

### Connect a stdio client

```bash
npx mcp-remote --transport stdio \
  --command mcp-bouncer-socket-bridge -- --socket /tmp/mcp-bouncer.sock
```

Or inspect with the official tooling:

```bash
npx -y @modelcontextprotocol/inspector -- \
  ./src-tauri/target/release/mcp-bouncer-socket-bridge --socket /tmp/mcp-bouncer.sock
```

The UI header shows the bridge path and a copy button whenever the helper binary exists; if you see “build helper to enable,” re-run `npm run build:bridge`.

---

## Logs & Debugging

- **Incoming Clients tab** lists MCP clients that connected to the proxy (name, version, timestamp).
- **Debugger tab** filters to servers that are currently connected and exposes tool invocation UI.
- JSON-RPC traffic is logged to `logs.sqlite` in the config directory; the frontend uses `@tauri-apps/plugin-sql` for the Logs page. Example queries:
  - `SELECT COUNT(*) FROM rpc_events;`
  - `SELECT * FROM rpc_events ORDER BY ts_ms DESC LIMIT 20;`

---

## Troubleshooting

- **“Build helper to enable” badge:** Run `npm run build:bridge` (dev) or `npm run build:bridge:release` (release). `npx tauri dev` does this automatically; standalone frontend runs (`npm run dev`) do not.
- **Port already in use:** When `transport = "streamable_http"` and port 8091 is busy, MCP Bouncer picks an ephemeral port and updates the header badge automatically.
- **Keyring errors on Linux:** Install `keyutils` / `libkeyutils`. Without them OAuth tokens fall back to plaintext storage.
- **Stale Unix socket:** If `/tmp/mcp-bouncer.sock` already exists from a crash, MCP Bouncer removes it on startup. If the removal fails (permissions, readonly FS), delete it manually and restart.

---

## Contributing

1. Fork and create a feature branch.
2. Keep diffs focused and documented.
3. Run:
   ```bash
   npm run build
   npm run lint
   npm run test:run
   cargo test --manifest-path src-tauri/Cargo.toml
   cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
   ```
4. Open a PR and describe testing results.

---

## License

MIT © Chris Atkins
