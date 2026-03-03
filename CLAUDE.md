# Ectotrees — Evil Tree Tracker

A RuneScape 3 dashboard for tracking the Evil Trees Distraction & Diversion across all 137 worlds in real time.

## Tech Stack

- **React 19** + **TypeScript** + **Vite 7**
- **Tailwind CSS v3** (not v4)
- **lucide-react** — icon library (`PanelLeft`, `PanelRight`, `Expand`, `X`, `HatGlasses`, `Timer`, `TreeDeciduous`, `Skull` used in sidebar/fullscreen toolbars; `Settings`, `Star`, `Pencil`, `Lightbulb`, `Check`, `ChevronUp`, `ChevronDown` used elsewhere)
- **@ncdai/react-wheel-picker** — scroll-wheel time picker used in `SpawnTimerView`
- **@base-ui/react** — headless Combobox primitive used in `SelectCombobox` (hint/location pickers)
- **@radix-ui/react-tooltip** — tooltip primitive wrapped in `ui/tooltip.tsx`
- **Express 5** + **ws** — backend server for real-time multi-user sync
- **tsx** — runs TypeScript server files directly
- Node 24.x LTS (`.nvmrc` pins to `24`; run `nvm use` to switch)

## Commands

```bash
npm run dev          # start Vite dev server (http://localhost:5173)
npm run host         # same as dev but exposed to the network (vite --host)
npm run build        # tsc -b && vite build
npm run lint         # eslint
npx tsc --noEmit     # type-check client only (run after every change)
npm run server       # start backend server (tsx server/index.ts, http://localhost:3001)
npm run server:check # type-check server only (npx tsc --noEmit -p server/tsconfig.json)
npm test             # run vitest unit tests (mutations + validation)
npm run test:watch   # vitest in watch mode
npm run test:e2e     # run Playwright E2E tests (auto-starts dev server)
npm run test:e2e:ui  # Playwright visual test runner UI
```

In development, run `npm run server` and `npm run dev` in two terminals. Vite proxies `/api` and `/ws` to `localhost:3001`.

## Project Structure

```
shared/
  types.ts              # Single source of truth: TreeType, WorldState, timing constants
  protocol.ts           # WebSocket message types (ClientMessage, ServerMessage)
  mutations.ts          # Pure state mutation functions (used by both client and server)
  hints.ts              # Location hints database (17 hints → possible exact locations)
  __tests__/
    mutations.test.ts   # Vitest unit tests for all mutation functions

server/
  index.ts              # Express 5 + WebSocket server entry point
  session.ts            # In-memory session management, auto-transitions, expiry
  validation.ts         # Input validation for all WebSocket messages
  log.ts                # Timestamped logging with configurable timezone (LOG_TZ)
  tsconfig.json         # Server-specific TypeScript config (target: ESNext)
  __tests__/
    validation.test.ts  # Vitest unit tests for validateMessage, validateInitializeState

e2e/
  app.spec.ts           # Playwright E2E tests: grid render, spawn timer, tree info, mark dead, detail view

src/
  data/worlds.json      # User-editable world config — add/remove worlds here
  data/tips.json        # Gameplay tips displayed in the scrolling tip ticker
  constants/evilTree.ts  # Re-exports from shared/types.ts + location hints, filterable types
  constants/toolColors.ts # Canonical UI color tokens (SPAWN_COLOR, TREE_COLOR, DEAD_COLOR, P2P_COLOR, F2P_COLOR, TREE_STATE_COLOR, CHIP_COLOR, TEXT_COLOR, CONNECTION_COLOR)
  types/index.ts         # Re-exports from shared/types.ts (incl. SpawnTreeInfo)
  lib/
    utils.ts            # cn() helper (clsx + tailwind-merge)
    analytics.ts        # Lightweight event tracking (UiPanel type, logView/logAction)
    sessionUrl.ts       # ?join=CODE URL param parsing and cleanup
  hooks/
    useWorldStates.ts   # Core state: localStorage persistence + sync integration + auto-transitions + lightning events
    useSession.ts       # WebSocket session management: create/join/leave, reconnection
    useFavorites.ts     # Favorite worlds persisted to localStorage
    useSettings.ts      # Visual effects + tip ticker + sidebar settings persisted to localStorage
    useIsMobile.ts      # Reactive matchMedia hook (< 640px) — drives sidebar mobile fallback
  components/
    WorldCard.tsx        # Card shell (85px tall, clickable body opens WorldDetailView)
    StatusSection.tsx    # Compact in-card status display with countdowns
    SpawnTimerTool.tsx   # Timer icon button — navigates to SpawnTimerView
    TreeInfoTool.tsx     # TreeDeciduous icon button — navigates to TreeInfoView
    TreeDeadTool.tsx     # Skull icon button — navigates to TreeDeadView
    ViewHeader.tsx       # Shared view header: icon + title + "World {id} · type badge" subtitle
    SpawnTimerView.tsx   # Full-screen/sidebar: set spawn countdown + optional location hint
    TreeInfoView.tsx     # Full-screen/sidebar: record tree type, hint, exact location, health
    TreeDeadView.tsx     # Full-screen/sidebar: confirm mark-dead (starts 30-min reward window)
    WorldDetailView.tsx  # Full-screen/sidebar: complete world status + quick tool access + clear
    SessionBar.tsx       # Session UI: create/join/leave sync sessions, status indicator
    SessionJoinView.tsx  # Full-screen/sidebar: before-you-join comparison view (shows session world state vs local)
    HealthButtonGrid.tsx # 4-column grid of 20 health buttons (5–100%), color-coded
    SortFilterBar.tsx    # Sort/filter controls for the world grid (collapsible)
    SettingsView.tsx     # Full-screen/sidebar settings panel (visual effects + sidebar toggles)
    LightningEffect.tsx  # Canvas-based procedural lightning bolt animation
    SparkEffect.tsx      # GSAP-based ember particle animation (dead trees)
    TipTicker.tsx        # Infinite-scrolling tip footer (tips from data/tips.json)
    ui/switch.tsx        # Radix UI switch wrapper
    ui/resizable.tsx     # react-resizable-panels v4 wrappers (shadcn/ui-style handle)
    ui/tooltip.tsx       # Radix UI tooltip wrapper
    ui/combobox.tsx      # @base-ui/react Combobox primitives (base layer for SelectCombobox)
    ui/select-combobox.tsx # High-level combobox: desktop uses combobox.tsx, mobile falls back to native <select>
```

## Key Architecture Decisions

### Layout
CSS Grid with `minmax(128px, 1fr)` — all 137 world cards visible on a 1920×1080 screen without scrolling. Cards are fixed at 85px tall.

The outer shell is `h-screen flex flex-col` so the viewport is always pinned — the world grid (and sidebar, when open) scroll independently within their panels; the page itself never scrolls.

### Sidebar Panel
Uses `react-resizable-panels` v4 (`Group` / `Panel` / `Separator` API — numbers are **pixels** in v4, use strings like `"30%"` for percentages). `src/components/ui/resizable.tsx` provides shadcn/ui-style wrappers (`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`) plus a re-export of `useDefaultLayout` (not used internally — sidebar sizing is handled manually).

- Panel `defaultSize` starts at 30% and is persisted as a percentage (0–100) to `localStorage` key `ectotrees-sidebar-pct` via `onLayoutChanged` on the Group. `defaultSize` is always passed as a percentage **string** (e.g. `"30%"`) — bare pixel numbers cause the library to crash at mount before the container is in the DOM.
- Panel constraints: sidebar `minSize="365px"`, grid `minSize="300px"` (px strings, no maxSize enforced). The `ResizablePanelGroup` uses `key={settings.sidebarSide}` so switching sides forces a full remount — the new panel reads the stored `sidebarPct` as its `defaultSize`, making the sidebar appear at the same width after a side swap.
- Both `SidebarWrapper` and `FullscreenWrapper` render a **3-section toolbar**: left (dock/expand controls) · center (4 tool-navigation buttons) · right (Close). The center buttons are defined in `NAV_ITEMS` (module-level constant in `App.tsx`) and only render when `worldNavProp` is non-null (i.e. a world tool/detail view is active — not grid or settings). Active button is highlighted `text-amber-400`. `worldNavProp` is `undefined` for the settings view.
- **Tool nav buttons** (`NAV_ITEMS`): `HatGlasses` View · `Timer` Timer · `TreeDeciduous` Tree · `Skull` Dead. Labels use `hidden sm:inline` — icons only below 640px. On mobile fullscreen, buttons are larger (`h-5 w-5 px-2 py-2`) and left-aligned; on desktop they are smaller (`sm:h-3.5 sm:w-3.5 sm:px-1.5 sm:py-1`) and centered via `sm:absolute sm:left-1/2 sm:-translate-x-1/2`.
- `SidebarWrapper` toolbar uses `grid grid-cols-[1fr_auto_1fr]`; `FullscreenWrapper` toolbar uses `relative flex` (left-aligned on mobile, absolute-centered nav on desktop).
- `[&>*]:!min-h-full` on the scroll container overrides the `min-h-screen` class on view root divs so they fill the panel height rather than forcing `100vh`
- `useIsMobile()` (`src/hooks/useIsMobile.ts`) reactively watches `window.matchMedia('(max-width: 639px)')` and forces full-screen mode below 640px (Tailwind `sm`) regardless of the setting — tablets (≥ 640px) can use the sidebar
- The `FullscreenWrapper` component wraps every non-grid fullscreen view. Its top bar is constrained to `max-w-lg mx-auto`. On mobile `showDockControls={false}` so no `PanelLeft` / `PanelRight` buttons appear; clicking a dock button sets `sidebarEnabled: true` and the chosen `sidebarSide` in one action.

### Navigation (App.tsx)
`activeView` discriminated union drives what is rendered:
```typescript
type ActiveView =
  | { kind: 'grid' }
  | { kind: 'spawn' | 'tree' | 'dead' | 'detail'; worldId: number }
  | { kind: 'settings' }
  | { kind: 'session-join'; code: string };
```
Tool views (`spawn`, `tree`, `dead`) return to grid on submit/cancel. `detail` is opened by clicking a card body; the detail view exposes all three tools directly. `settings` is opened from the ⚙ button in the header. `session-join` is shown when joining a session that has existing state — it renders `SessionJoinView` to let the user compare and decide whether to contribute their local data.

**Sidebar mode** (opt-in, available on screens ≥ 640px): when `settings.sidebarEnabled` is true and the viewport is ≥ 640px, any non-grid `activeView` renders in a resizable panel beside the world grid instead of replacing it. `useSidebar = settings.sidebarEnabled && !isMobile && activeView.kind !== 'grid'`. On mobile or when disabled, the original full-screen behaviour is unchanged.

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
- **Health cap at 50%**: 10 minutes after `matureAt` (`LIGHTNING_1_MS`) — if health is undefined or >50%, it is capped to 50
- **Health cap at 25%**: 20 minutes after `matureAt` (`LIGHTNING_2_MS`) — if health is undefined or >25%, it is capped to 25
- **Mature/Alive → Dead**: 30 minutes after `matureAt`
- **Dead → None**: 10 minutes after `deadAt` (fallen tree reward window)
- **Spawn timer fires**: when `now >= nextSpawnTarget`, the world transitions to `treeStatus: 'sapling'` (treeType `sapling`, treeSetAt = nextSpawnTarget)

Transition logic lives in `shared/mutations.ts` (`applyTransitions`), shared by client and server.

Health auto-transitions emit **lightning events** tracked in `useWorldStates`. These drive `LightningEffect` animations on the affected card and detail view. Event kinds: `lightning1` (10 min), `lightning2` (20 min), `death` (30 min). Death supersedes health events in the same tick. Events auto-expire after 3 seconds if not dismissed by the component.

In dev mode, `window.__triggerLightning(worldId, kind?)` manually fires a lightning event for testing.

### Tree Types
`sapling` | `sapling-tree` | `sapling-oak` | `sapling-willow` | `sapling-maple` | `sapling-yew` | `sapling-magic` | `sapling-elder` | `mature` | `tree` | `oak` | `willow` | `maple` | `yew` | `magic` | `elder`

Sapling variants allow recording the expected species during the sapling phase. On the `sapling → mature` auto-transition the variant suffix becomes the confirmed `treeType` (e.g. `sapling-oak` → `oak`). Plain `sapling` is used when the type is unknown.

### Sort & Filter Bar (SortFilterBar.tsx)
The grid has a collapsible sort/filter bar. A toggle button collapses it to a summary line of active filter pills (collapsed state persisted to `localStorage`). When expanded, there are four sections:
- **Sort buttons**: W#, Soonest/Latest, Favorite, Health (with asc/desc toggle; clicking an active button toggles direction)
  - `Soonest/Latest` sorts by the next relevant timestamp across urgency buckets: dead trees → alive/mature → saplings → spawn timers → inactive
- **Filter chips**: Favorite, P2P, F2P (boolean toggles; P2P/F2P are mutually exclusive)
- **Tree type filter chips**: Unknown, Sapling, Tree, Oak, Willow, Maple, Yew, Magic, Elder (multi-select; defined in `FILTERABLE_TREE_TYPES` in `constants/evilTree.ts`)
- **Info tri-state filter chips**: Intel, Hint, Location, Health — each cycles through three states: off → **Needs** (show only worlds missing that info) → **Has** (show only worlds that have it)

Tree type filters show only worlds with a matching confirmed tree type. The "Unknown" chip matches sapling, mature, and worlds with no confirmed type. When any tree type filter is active, inactive worlds (no data, no spawn) are hidden.

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

- **`types.ts`** — `TreeType`, `WorldState`, `WorldStates`, timing constants (`SAPLING_MATURE_MS`, `ALIVE_DEAD_MS`, `DEAD_CLEAR_MS`, `LIGHTNING_1_MS`, `LIGHTNING_2_MS`, `HEALTH_LIGHTNING_1`, `HEALTH_LIGHTNING_2`), payload interfaces
- **`protocol.ts`** — `ClientMessage` and `ServerMessage` discriminated unions defining the WebSocket protocol
- **`mutations.ts`** — Pure functions (`applySetSpawnTimer`, `applySetTreeInfo`, `applyUpdateTreeFields`, `applyUpdateHealth`, `applyMarkDead`, `applyClearWorld`, `applyReportLightning`, `applyTransitions`) that take a `WorldStates` map and return a new one
- **`hints.ts`** — `LOCATION_HINTS` map: 17 in-game location hints → arrays of possible exact locations, used in `TreeInfoView` and `WorldDetailView` to narrow exact location options when a hint is known

`src/types/index.ts` and `src/constants/evilTree.ts` re-export from `shared/types.ts`.

## Server Architecture (`server/`)

### Overview
Express 5 HTTP server with a `ws` WebSocket server attached in `noServer` mode (shares the same HTTP server via the `upgrade` event). All session state is **in-memory** (no database; state is lost on server restart).

Security response headers applied to all HTTP responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 0`

### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | TCP port the server listens on |
| `LOG_TZ` | `America/New_York` | IANA timezone for server log timestamps (e.g. `UTC`, `Europe/London`) |

### REST Endpoints
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/session` | Create a new session. Returns `{ code }` |
| `GET` | `/api/session/:code` | Check if session exists. Returns `{ code, clientCount }` |
| `GET` | `/api/session/:code/worlds` | Preview session world state (active worlds only). Returns `{ worlds }` — used by `SessionJoinView` before joining |
| `GET` | `/api/health` | Health check. Returns `{ ok, uptimeSeconds, uptime, sessions, clients }` |

### WebSocket Protocol
Clients connect to `ws://host/ws?code=XXXXXX`. The server validates the session code on upgrade.

**Client → Server messages** (`ClientMessage`):
| Type | Payload |
|---|---|
| `setSpawnTimer` | `worldId`, `msFromNow`, optional `treeInfo: { treeHint? }`, optional `msgId` |
| `setTreeInfo` | `worldId`, `info: TreeInfoPayload`, optional `msgId` |
| `updateTreeFields` | `worldId`, `fields: TreeFieldsPayload`, optional `msgId` |
| `updateHealth` | `worldId`, `health: number \| undefined`, optional `msgId` |
| `markDead` | `worldId`, optional `msgId` |
| `clearWorld` | `worldId`, optional `msgId` |
| `contributeWorlds` | `worlds: WorldStates`, optional `msgId` — merges joiner's local state into session; only worlds not already present are inserted |
| `initializeState` | `worlds: WorldStates` — seeds a fresh session with the creator's local state (no `msgId`) |
| `reportLightning` | `worldId`, `health: 50 \| 25`, optional `msgId` — reports a client-observed lightning strike; server applies `applyReportLightning` and broadcasts |
| `ping` | (no payload, no `msgId`) |

**Server → Client messages** (`ServerMessage`):
| Type | Payload |
|---|---|
| `snapshot` | `worlds: WorldStates` — full state on connect |
| `worldUpdate` | `worldId`, `state: WorldState \| null` (`null` = cleared) |
| `clientCount` | `count: number` — broadcast on join/leave |
| `ack` | `msgId: number` — confirms a mutation was applied |
| `pong` | (no payload) — response to `ping` |
| `error` | `message: string` |
| `sessionClosed` | `reason: string` — sent before closing expired sessions |

### Session Management (`session.ts`)
- Session codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I` to avoid ambiguity)
- Max 1000 concurrent sessions, max 1000 clients per session
- Server runs auto-transitions every 10 seconds per session, broadcasting only changed worlds
- On connect: sends a `snapshot` of all active worlds, then broadcasts `clientCount`
- Session expiry (checked every 5 min): inactive > 24 hours, or empty > 60 minutes

### Validation (`validation.ts`)
- `worldId` must exist in `worlds.json`
- `msFromNow` must be a positive integer, max 2 hours
- Strings are sanitized (control chars stripped, max 200 chars)
- `treeType` must be a known type; `treeHealth` must be 5/10/15/.../100

### Per-Connection Protections
- Max message size: 4 KB (64 KB for `initializeState` and `contributeWorlds`)
- Rate limit: 10 messages/second per WebSocket connection
- Heartbeat: server pings every 30s, closes if no pong within 90s

## Settings (`useSettings.ts` + `SettingsView.tsx`)

Five settings, persisted to `localStorage` (`evilTree_settings`):

| Setting | Default | Description |
|---|---|---|
| `effectsLightning` | `true` | Enable canvas lightning bolt animations on health auto-transitions |
| `effectsSparks` | `true` | Enable GSAP ember particle animations on dead tree cards |
| `showTipTicker` | `true` | Show scrolling tip ticker in the footer |
| `sidebarEnabled` | `false` | Show tool views in a sidebar panel beside the grid (desktop only) |
| `sidebarSide` | `'right'` | Which side the sidebar docks to (`'left'` or `'right'`) |

Settings are accessed via `useSettings()` and edited in `SettingsView` (⚙ button in header). All new fields use graceful migration — existing stored settings without them fall back to their defaults.

## Visual Effects

### Lightning (`LightningEffect.tsx`)
Canvas-based procedural lightning bolt animation, 700ms duration. Triggered on three health auto-transitions (emitted as `LightningEvent` objects from `useWorldStates`):
- **`lightning1`** — at 10 min (`LIGHTNING_1_MS`): health capped to 50%
- **`lightning2`** — at 20 min (`LIGHTNING_2_MS`): health capped to 25%
- **`death`** — at 30 min: tree dies

Each event carries a `seq` counter that forces the component to remount so the animation retriggers if rapid events arrive. Rendered on both `WorldCard` and `WorldDetailView` (conditionally on `effectsLightning`).

### Sparks (`SparkEffect.tsx`)
GSAP-based orange ember particle animation shown on cards/detail views where `treeStatus === 'dead'`. Particles are density-scaled to the container size. Deferred via `requestIdleCallback` (mobile-safe fallback to `setTimeout`). Conditionally rendered on `effectsSparks`.

### Tip Ticker (`TipTicker.tsx`)
Infinite horizontal-scroll footer showing tips from `src/data/tips.json`. Tips are shuffled once on mount. Uses seamless CSS keyframe animation with two side-by-side copies and a duration calculated from content width at 20 px/s. Conditionally rendered on `showTipTicker`. The footer also shows the app version.

## PWA

- **Service worker** (`public/sw.js`): cache-first for app shell, network-first for navigate requests (fallback to `index.html`). Excludes `/api` and `/ws`.
- **Web app manifest** (`public/manifest.webmanifest`): standalone display mode, dark theme (`#0f172a`).
- **Registration** (`src/registerServiceWorker.ts`): registers in production only (`import.meta.env.PROD`).
- iOS homescreen meta tags in `index.html` (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`).

## Client Sync Layer (`useSession.ts`)

- `createSession(initialStates?)` — POST to `/api/session`, connect WebSocket, then send `initializeState` with the caller's local world state to seed the fresh session
- `joinSession(code)` — GET to `/api/session/:code` to validate, then connect
- `rejoinSession(code)` — same as `joinSession` but resets the reconnect counter (used by the UI's manual retry button)
- `leaveSession()` — close WebSocket cleanly
- `dismissError()` — clear the current error state
- **Session code persistence**: active session code is stored in `localStorage` (`evilTree_sessionCode`) and auto-resumed on page reload
- **`?join=CODE` URL parameter**: on page load, if a `?join=` query param is present with a valid 6-character code, the session is joined automatically and the param is removed from the URL history
- **Reconnection**: exponential backoff `[1s, 2s, 4s, 8s, 16s, 30s]`, max 10 attempts before giving up; fatal errors (`Session is full.`, `Session not found.`) skip reconnection entirely
- **Ping/pong**: ping sent every 30s; if `pong` is not received within 8s the socket is force-closed
- **ACK system**: every mutation is tagged with a `msgId`; server replies with `ack`; if no ACK is received within 5s the socket is force-closed. Pending (unACKed) mutations are replayed in order on reconnect.
- Returns a `SyncChannel` passed into `useWorldStates` — when non-null, localStorage writes are skipped and the server is the source of truth. All mutations are sent to the server and applied optimistically on the client.

## Adding/Removing Worlds
Edit `src/data/worlds.json`. Format: `{ "worlds": [{ "id": 1, "type": "P2P" }, ...] }`
