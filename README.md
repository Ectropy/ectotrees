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
  - Sort by world number, soonest/latest spawn or end time, health, or favorites
  - Filter by favorites, P2P/F2P
  - **Tree type filters** — filter the grid by tree species (Unknown, Tree, Oak, Willow, Maple, Yew, Magic, Elder) so you can focus on the trees you want to cut
  - **Info filters** — tri-state chips (Intel, Hint, Location, Health) to show worlds that need a piece of information or already have it
- **Real-time multi-user sync** — create a session (6-character code), share it with friends, and everyone sees updates instantly via WebSocket
- State persists in `localStorage` between sessions; when in a sync session, the server is the source of truth

## Multi-user sync

1. One player clicks **Create Session** in the session bar at the top of the grid
2. A 6-character session code is generated (e.g. `A3KW7N`) — your current local state is shared into the new session automatically
3. Share the code with friends — they click **Join Session** and type it in
4. All connected users see world updates in real time
5. Click **Leave** to disconnect and return to local-only mode (your last-seen state is saved to `localStorage`)

Session limits: max 1000 concurrent sessions, max 1000 clients per session. Sessions expire after 24 hours of inactivity or 60 minutes with no connected clients.

> **Tip:** If you already have local tracking data when you join a session, you'll be prompted to contribute it to the session — only worlds not already tracked in the session will be added.

## Customising worlds

Edit [src/data/worlds.json](src/data/worlds.json) to add or remove worlds:

```json
{ "worlds": [{ "id": 1, "type": "P2P" }, { "id": 2, "type": "F2P" }] }
```

## Getting started

**Prerequisites:** Node.js 24+ (use `nvm use` if you have nvm — the project includes a `.nvmrc`)

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
npm test               # unit tests (Vitest — mutations, validation)
npm run test:e2e       # E2E tests (Playwright — auto-starts dev server)
npm run test:e2e:ui    # Playwright visual UI for debugging tests
```

## Local Docker (beginner quick start)

Use this when you want to test the app the same way a deploy server would run it.

### 1) Build a local image

From the project root:

```bash
docker build -t ectotrees:local .
```

What this means:
- `ectotrees` is the image name
- `local` is the tag (a label). Here it means "my local test build", not a formal release

### 2) Run the container

```bash
docker run --name ectotrees-local -p 3001:3001 -d ectotrees:local
```

Then open `http://localhost:3001`.

### 3) Rebuild after code changes

If you already have a previous local container, remove it first:

```bash
docker rm -f ectotrees-local
docker build -t ectotrees:local .
docker run --name ectotrees-local -p 3001:3001 -d ectotrees:local
```

### 4) Useful checks

```bash
docker ps                        # running containers
docker logs -f ectotrees-local   # live app logs
docker stop ectotrees-local      # stop container
```

## Deploying with Docker + Caddy (HTTPS)

Use this when running as an installable PWA on mobile devices (iOS requires HTTPS). This project ships with a `Caddyfile` and a `docker-compose.example.yml` that set up the app behind Caddy, which provisions TLS certificates automatically via Let's Encrypt.

```bash
# 1. Copy the example compose file
cp docker-compose.example.yml docker-compose.yml

# 2. Create the required Caddy directories
mkdir -p caddy/{caddy_data,caddy_config}

# 3. Copy and configure the Caddyfile — replace 'ectotrees.example.com' with your domain
cp Caddyfile caddy/Caddyfile
nano caddy/Caddyfile

# 4. Start
docker compose up -d
```

Caddy routes `/api/*` and `/ws` to the Node backend and falls through to the app for all other requests.

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

## Tech stack

- React 18 + TypeScript + Vite 7
- Tailwind CSS v3
- Express 5 + ws (WebSocket server)
- Shared TypeScript types and mutation logic between client and server (`shared/`)
