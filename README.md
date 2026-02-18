# Ecto Trees — Evil Tree Tracker for turning Evil Trees into dead trees.

A RuneScape 3 dashboard for coordinating the **Evil Trees** Distraction & Diversion across all 137 worlds in real time.

## What it does

Evil Trees spawn in waves across RS3 worlds. This tool lets you (and a group of players) track the state of every world's tree on one screen:

- **137 world cards** displayed in a compact grid — all visible at once on a 1080p monitor
- Per-world **status tracking**: no tree → sapling → mature → alive → dead → (cycle repeats)
- **Automatic state transitions** based on known game timings (sapling matures at 5 min, tree dies at 30 min, fallen tree despawns at 10 min after death)
- Three tools on every card:
  - **Spawn timer** — set a countdown to the next expected spawn, with optional location hint
  - **Tree info** — record tree type, location hint, and exact location
  - **Mark dead** — mark a tree as dead with one click (with confirmation)
- **Click any card** to open a full-screen detail view showing the complete status (tree type, full location, live countdowns). All three tools are accessible directly from the detail view, and a **clear world state** option lets you instantly reset a world if you recorded information on the wrong one
- **Sort & filter bar** with multiple options:
  - Sort by world number, active status, spawn time, ending time, health, or favorites
  - Filter by favorites, active/no-data, P2P/F2P
  - **Tree type filters** — filter the grid by tree species (Unknown, Tree, Oak, Willow, Maple, Yew, Magic, Elder) so you can focus on the trees you want to cut
- **Real-time multi-user sync** — create a session (6-character code), share it with friends, and everyone sees updates instantly via WebSocket
- State persists in `localStorage` between sessions; when in a sync session, the server is the source of truth

## Getting started

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Start the backend server (http://localhost:3001)
npm run server

# In a second terminal, start the frontend dev server (http://localhost:5173)
npm run dev
```

The Vite dev server proxies `/api` and `/ws` requests to the backend, so you only need to open `http://localhost:5173` in your browser.

To expose the dev server to your local network (e.g. for testing on a phone):

```bash
npm run host
```

### Running without the server

The app works fully offline — if you don't start the server, all tracking features work locally with `localStorage`. The server is only needed for multi-user sync sessions.

## Other commands

```bash
npm run build          # production build (output in dist/)
npm run lint           # run ESLint
npx tsc --noEmit       # type-check client
npm run server:check   # type-check server
```

## Deploying with HTTPS (Nginx)

Use this when running as an installable PWA on mobile devices (iOS requires HTTPS).

1. Build the frontend:
```bash
npm run build
```
2. Run the backend server on localhost:
```bash
npm run server
```
3. Install the Nginx site config from `deploy/nginx/ectotrees.conf` and update:
- `server_name`
- `ssl_certificate` and `ssl_certificate_key`
- `root` path (should point at your `dist/`)
4. Enable the site and reload Nginx.

This setup serves static files from Nginx and proxies:
- `/api/*` to the Node backend
- `/ws` WebSocket upgrades to the Node backend

### Host-agnostic endpoint configuration

By default, the frontend is host agnostic:
- API calls use `/api`
- WebSocket uses the browser origin (`ws://<current-host>/ws` or `wss://<current-host>/ws`)

If you need custom routing, set Vite env vars at build time:

```bash
# Example: API under a prefixed path on the same host
VITE_API_BASE=/backend/api

# Example: explicit WebSocket endpoint
VITE_WS_BASE=wss://example.com/realtime
```

Notes:
- `VITE_API_BASE` accepts either a full `http(s)://...` URL or a path like `/api`.
- `VITE_WS_BASE` accepts either a full `ws(s)://...` URL or a path prefix on the current host.

## Multi-user sync

1. One player clicks **Create Session** in the session bar at the top of the grid
2. A 6-character session code is generated (e.g. `A3KW7N`)
3. Share the code with friends — they click **Join Session** and type it in
4. All connected users see world updates in real time
5. Click **Leave** to disconnect and return to local-only mode (your last-seen state is saved to `localStorage`)

Session limits: max 50 concurrent sessions, max 20 clients per session. Sessions expire after 2 hours of inactivity or 30 minutes with no connected clients.

## Customising worlds

Edit [src/data/worlds.json](src/data/worlds.json) to add or remove worlds:

```json
{ "worlds": [{ "id": 1, "type": "P2P" }, { "id": 2, "type": "F2P" }] }
```

## Tech stack

- React 18 + TypeScript + Vite 5
- Tailwind CSS v3
- Express 5 + ws (WebSocket server)
- Shared TypeScript types and mutation logic between client and server (`shared/`)
