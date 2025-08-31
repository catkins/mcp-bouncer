Tauri v2 bootstrap for MCP Bouncer

This directory contains a minimal Tauri v2 application configured to use the existing Vite frontend in `../frontend`.

Usage (with Tauri CLI installed):

- Dev: from `tauri/src-tauri`, run `cargo tauri dev`
  - Uses frontend dev server at `http://localhost:5173`
  - Runs `npm run --prefix ../frontend dev` before launching
- Build: from `tauri/src-tauri`, run `cargo tauri build`
  - Runs `npm run --prefix ../frontend build` first
  - Bundles `../frontend/dist`

Notes
- Config schema: https://schema.tauri.app/config/2
- Incremental migration: backend commands and events can be added to `src/main.rs` via Tauri commands and plugins.
- Shell plugin is enabled to allow opening external URLs from the UI if needed.

