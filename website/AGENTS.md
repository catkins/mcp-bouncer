# Marketing Website for MCP Bouncer

This is the marketing website for the MCP Bouncer desktop app (Astro + Tailwind 4).

## Quick start
- Dev server: `npm run dev` (served at http://localhost:4321)
- Build: `npm run build` (outputs to `dist/`)
- Preview built site: `npm run preview`

## Assets
- App icon: `public/appicon.png` (shared with the desktop app)
- Screenshots: `public/serverlist.png`, `public/debugger.png`, `public/logs.png`

## Styling
- Tailwind v4 with theme tokens aligned to the desktop app dark palette (`#181c1f` base, brand greens in `src/styles/global.css`).

## Tips
- Keep copy aligned with the root README positioning (desktop MCP gateway; Tauri + React UI).
- When updating layout/meta defaults, edit `src/layouts/Layout.astro`.
- Main page lives at `src/pages/index.astro`.
