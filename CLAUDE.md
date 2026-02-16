# Ectotrees — Evil Tree Tracker

A RuneScape 3 dashboard for tracking the Evil Trees Distraction & Diversion across all 137 worlds in real time.

## Tech Stack

- **React 18** + **TypeScript** + **Vite 5**
- **Tailwind CSS v3** (not v4)
- **Express 5** + **ws** — backend server for real-time multi-user sync
- **tsx** — runs TypeScript server files directly
- Node 18.x (v18.16.1 on this machine — some ESLint packages warn about engine mismatch, ignore those)

## Commands

```bash
npm run dev          # start Vite dev server (http://localhost:5173)
npm run host         # same as dev but exposed to the network (vite --host)
npm run build        # tsc -b && vite build
npm run lint         # eslint
npx tsc --noEmit     # type-check client only (run after every change)
npm run server       # start backend server (tsx server/index.ts, http://localhost:3001)
npm run server:check # type-check server only (npx tsc --noEmit -p server/tsconfig.json)
```

In development, run `npm run server` and `npm run dev` in two terminals. Vite proxies `/api` and `/ws` to `localhost:3001`.

## Project Structure

```
shared/
  types.ts              # Single source of truth: TreeType, WorldState, timing constants
  protocol.ts           # WebSocket message types (ClientMessage, ServerMessage)
  mutations.ts          # Pure state mutation functions (used by both client and server)

server/
  index.ts              # Express 5 + WebSocket server entry point
  session.ts            # In-memory session management, auto-transitions, expiry
  validation.ts         # Input validation for all WebSocket messages
  tsconfig.json         # Server-specific TypeScript config

src/
  data/worlds.json      # User-editable world config — add/remove worlds here
  constants/evilTree.ts # Re-exports from shared/types.ts + location hints, filterable types
  types/index.ts        # Re-exports from shared/types.ts
  hooks/
    useWorldStates.ts   # Core state: localStorage persistence + sync integration + auto-transitions
    useSession.ts       # WebSocket session management: create/join/leave, reconnection
    useFavorites.ts     # Favorite worlds persisted to localStorage
  components/
    WorldCard.tsx        # Card shell (85px tall, clickable body opens WorldDetailView)
    StatusSection.tsx    # Compact in-card status display with countdowns
    SpawnTimerTool.tsx   # ⏱ button — navigates to SpawnTimerView
    TreeInfoTool.tsx     # 🌳 button — navigates to TreeInfoView
    TreeDeadTool.tsx     # ☠ button — navigates to TreeDeadView
    SpawnTimerView.tsx   # Full-screen: set spawn countdown + optional location hint
    TreeInfoView.tsx     # Full-screen: record tree type, hint, exact location, health
    TreeDeadView.tsx     # Full-screen: confirm mark-dead (starts 30-min reward window)
    WorldDetailView.tsx  # Full-screen: complete world status + quick tool access + clear
    SessionBar.tsx       # Session UI: create/join/leave sync sessions, status indicator
    HealthButtonGrid.tsx # 4-column grid of 20 health buttons (5–100%), color-coded
    SortFilterBar.tsx    # Sort/filter controls for the world grid
```

## Key Architecture Decisions

### Layout
CSS Grid with `minmax(128px, 1fr)` — all 137 world cards visible on a 1920×1080 screen without scrolling. Cards are fixed at 85px tall.

### Navigation (App.tsx)
`activeView` discriminated union drives what is rendered:
```typescript
type ActiveView =
  | { kind: 'grid' }
  | { kind: 'spawn' | 'tree' | 'dead' | 'detail'; worldId: number };
```
Full-screen views replace the entire grid. Tool views (`spawn`, `tree`, `dead`) return to grid on submit/cancel. `detail` is opened by clicking a card body; the detail view exposes all three tools directly so users don't need to return to the grid first.

### State Model (per world)
Defined in `shared/types.ts`, used by both client and server:
```typescript
{
  treeStatus: 'none' | 'sapling' | 'mature' | 'alive' | 'dead'
  nextSpawnTarget?: number  // ms timestamp — when spawn is expected
  spawnSetAt?: number       // ms timestamp — when spawn timer was set
  treeType?: TreeType
  treeHint?: string
  treeExactLocation?: string
  treeHealth?: number       // 5–100 in increments of 5 (optional)
  treeSetAt?: number        // ms timestamp — when tree info was recorded
  matureAt?: number
  deadAt?: number
}
```

### SpawnTimerView
SpawnTimerView only allows setting a location **hint**, not an exact location. The exact location cannot be known before a tree spawns — only the hint is available pre-spawn.

### State Invariants
- `nextSpawnTarget` and any active tree state are **mutually exclusive** (game mechanic: dead tree = no known next spawn). `markDead`, `setTreeInfo`, and auto-transitions all enforce this.
- All three tools are **always enabled** — each serves as a correction path from any state.
- Auto-transitions use exact timestamps for `deadAt` (e.g., `matureAt + 30min`), not `Date.now()`, to avoid drift from the poll interval.
- `clearWorld(worldId)` deletes the key from state entirely; the grid fallback `?? { treeStatus: 'none' }` handles the missing key.

### Auto-Transitions
Client checks every 1 second (for smooth countdown display), server checks every 10 seconds per session.
- **Sapling → Mature**: 5 minutes after `treeSetAt`
- **Mature/Alive → Dead**: 30 minutes after `matureAt`
- **Dead → None**: 10 minutes after `deadAt` (fallen tree reward window)
- **Spawned → None**: 35 minutes after `nextSpawnTarget` (clears "Spawned!" notification)

Transition logic lives in `shared/mutations.ts` (`applyTransitions`), shared by client and server.

### Tree Types
`sapling` | `mature` (auto-transition, type unknown) | `tree` | `oak` | `willow` | `maple` | `yew` | `magic` | `elder`

### Sort & Filter Bar (SortFilterBar.tsx)
The grid has a sort/filter bar with three sections:
- **Sort buttons**: W#, Active, Spawn, Ending, Health, Favorite (with asc/desc toggle)
- **Filter chips**: Favorite, Active, No data, P2P, F2P (boolean toggles; Active/No data are mutually exclusive, P2P/F2P are mutually exclusive)
- **Tree type filter chips**: Unknown, Tree, Oak, Willow, Maple, Yew, Magic, Elder (multi-select; defined in `FILTERABLE_TREE_TYPES` in `constants/evilTree.ts`)

Tree type filters show only worlds with a matching confirmed tree type. The "Unknown" chip matches sapling, mature, and worlds with no confirmed type. When any tree type filter is active, inactive worlds (no data, no spawn) are hidden.

The **Health** sort mode also acts as an implicit filter — worlds without a recorded `treeHealth` are hidden when this sort is active. Third click reverts to W# ascending.

All sort/filter preferences are persisted to `localStorage` (`evilTree_sort`, `evilTree_filters`).

### Tool Availability
| Tool | Enabled when |
|---|---|
| ⏱ Spawn timer | Always |
| 🌳 Tree info | Always |
| ☠ Mark dead | Always |
| Clear world state | When world has any active state (link in WorldDetailView) |

## Shared Directory (`shared/`)

Pure TypeScript code shared between client and server — the single source of truth for types, constants, protocol, and state mutations.

- **`types.ts`** — `TreeType`, `WorldState`, `WorldStates`, timing constants (`SAPLING_MATURE_MS`, `ALIVE_DEAD_MS`, `DEAD_CLEAR_MS`), payload interfaces
- **`protocol.ts`** — `ClientMessage` and `ServerMessage` discriminated unions defining the WebSocket protocol
- **`mutations.ts`** — Pure functions (`applySetSpawnTimer`, `applySetTreeInfo`, `applyUpdateTreeFields`, `applyUpdateHealth`, `applyMarkDead`, `applyClearWorld`, `applyTransitions`) that take a `WorldStates` map and return a new one

`src/types/index.ts` and `src/constants/evilTree.ts` re-export from `shared/types.ts`.

## Server Architecture (`server/`)

### Overview
Express 5 HTTP server with a `ws` WebSocket server attached in `noServer` mode (shares the same HTTP server via the `upgrade` event). All session state is **in-memory** (no database; state is lost on server restart).

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | TCP port the server listens on |

### REST Endpoints
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/session` | Create a new session. Returns `{ code }`. Rate-limited: 5/IP/hour |
| `GET` | `/api/session/:code` | Check if session exists. Returns `{ code, clientCount }` |
| `GET` | `/api/health` | Health check. Returns `{ ok, sessions }` |

### WebSocket Protocol
Clients connect to `ws://host/ws?code=XXXXXX`. The server validates the session code on upgrade.

**Client → Server messages** (`ClientMessage`):
| Type | Payload |
|---|---|
| `setSpawnTimer` | `worldId`, `msFromNow`, optional `treeInfo: { treeHint? }` |
| `setTreeInfo` | `worldId`, `info: TreeInfoPayload` |
| `updateTreeFields` | `worldId`, `fields: TreeFieldsPayload` |
| `updateHealth` | `worldId`, `health: number \| undefined` |
| `markDead` | `worldId` |
| `clearWorld` | `worldId` |
| `ping` | (no payload) |

**Server → Client messages** (`ServerMessage`):
| Type | Payload |
|---|---|
| `snapshot` | `worlds: WorldStates` — full state on connect |
| `worldUpdate` | `worldId`, `state: WorldState \| null` (`null` = cleared) |
| `clientCount` | `count: number` — broadcast on join/leave |
| `error` | `message: string` |
| `sessionClosed` | `reason: string` — sent before closing expired sessions |

### Session Management (`session.ts`)
- Session codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I` to avoid ambiguity)
- Max 50 concurrent sessions, max 20 clients per session
- Server runs auto-transitions every 10 seconds per session, broadcasting only changed worlds
- On connect: sends a `snapshot` of all active worlds, then broadcasts `clientCount`
- Session expiry (checked every 5 min): inactive > 2 hours, or empty > 30 minutes

### Validation (`validation.ts`)
- `worldId` must exist in `worlds.json`
- `msFromNow` must be a positive integer, max 2 hours
- Strings are sanitized (control chars stripped, max 200 chars)
- `treeType` must be a known type; `treeHealth` must be 5/10/15/.../100

### Per-Connection Protections
- Max message size: 4 KB
- Rate limit: 10 messages/second per WebSocket connection
- Heartbeat: server pings every 30s, closes if no pong within 90s

## Client Sync Layer (`useSession.ts`)

- `createSession()` — POST to `/api/session`, then connect WebSocket
- `joinSession(code)` — GET to `/api/session/:code` to validate, then connect
- `leaveSession()` — close WebSocket cleanly
- Reconnection: exponential backoff `[1s, 2s, 4s, 8s, 16s, 30s]`, capped at 30s
- Application-level ping every 30s to keep connection alive
- Returns a `SyncChannel` passed into `useWorldStates` — when non-null, localStorage writes are skipped and the server is the source of truth. All mutations are sent to the server and applied optimistically on the client.

## Adding/Removing Worlds
Edit `src/data/worlds.json`. Format: `{ "worlds": [{ "id": 1, "type": "P2P" }, ...] }`
