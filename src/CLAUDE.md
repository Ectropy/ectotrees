# Client (Dashboard)

## File Structure

```
src/
  data/worlds.json      # User-editable world config — add/remove worlds here
  data/tips.json        # Gameplay tips displayed in the scrolling tip ticker
  constants/evilTree.ts  # Re-exports from shared/types.ts + location hints, filterable types; also exports TREE_TYPE_LABELS (full display names), TREE_TYPE_SHORT (abbreviated labels), formatMs(ms) duration formatter, and hint/location helpers (locationsForHint, resolveExactLocation, hintForLocation)
  constants/toolColors.ts # Canonical UI color tokens (BUTTON_LABEL_COLOR, SPAWN_COLOR, TREE_COLOR, DEAD_COLOR, P2P_COLOR, F2P_COLOR, TREE_STATE_COLOR, CHIP_COLOR, TEXT_COLOR, CONNECTION_COLOR, STATUS_DOT_COLORS, STATUS_TEXT_COLORS, ROLE_COLORS, ROLE_LABELS, BUTTON_SECONDARY)
  constants/__tests__/
    evilTree.test.ts     # Vitest unit tests for evilTree helpers
  types/index.ts         # Re-exports from shared/types.ts
  types/global.d.ts      # Global type declarations (e.g. __triggerLightning)
  lib/
    utils.ts            # cn() helper (clsx + tailwind-merge) + copyToClipboard(text): Promise<boolean> (navigator.clipboard with HTTP fallback)
    analytics.ts        # Lightweight event tracking (UiPanel type, logView/logAction)
    sessionUrl.ts       # extractSessionCode(raw), buildSessionUrl(code), buildIdentityUrl(token), validateSessionCode(code) — #join=CODE and #identity=TOKEN fragment URL parsing, generation, and validation
    intelCopy.ts        # buildWorldIntel(world, state): string and buildDiscordMessage(filteredWorlds, worldStates): string — formats intel for Discord using <t:UNIX:R> relative timestamps
    __tests__/
      analytics.test.ts # Vitest unit tests for analytics helpers
      sessionUrl.test.ts # Vitest unit tests for extractSessionCode
  hooks/
    useWorldStates.ts   # Core state: localStorage persistence + sync integration + auto-transitions + lightning events
    useSession.ts       # WebSocket session management: create/join/leave, reconnection
    useSettings.ts      # Visual effects + tip ticker + sidebar settings persisted to localStorage
    useIsMobile.ts      # Reactive matchMedia hook (< 640px) — drives sidebar mobile fallback
    useEscapeKey.ts     # Calls callback when Escape key is pressed (stable ref, no re-subscribe on re-render)
    useCountdown.ts     # Returns whole seconds remaining until a ms timestamp; re-ticks every 500ms by default
    useCopyFeedback.ts  # Returns { copied, copy(text) } — copy writes to clipboard, copied flips true for 2s
    useStoredSet.ts     # Generic localStorage-backed Set<number> hook; App.tsx uses it directly for favorites (evilTree_favorites) and hidden worlds (evilTree_hiddenWorlds)
    useFilteredWorlds.ts # Sort/filter logic + localStorage persistence for sort/filter preferences
    useNow.ts           # Reactive timestamp primitive (returns Date.now() as state, re-ticks every interval ms)
    useSessionBrowser.ts # Fetches GET /api/sessions and returns sorted SessionSummary[]; sort modes: 'newest' | 'active' | 'members'
  components/
    WorldCard.tsx        # Card shell (85px tall, clickable body opens WorldDetailView); shows EyeOff icon when hidden
    StatusSection.tsx    # Compact in-card status display with countdowns
    ViewHeader.tsx       # Shared view header: icon + title + "World {id} · type badge" subtitle
    SpawnTimerView.tsx   # Full-screen/sidebar: set spawn countdown + optional location hint
    TreeInfoView.tsx     # Full-screen/sidebar: record tree type, hint, exact location, health
    TreeDeadView.tsx     # Full-screen/sidebar: confirm mark-dead (starts 30-min reward window)
    WorldDetailView.tsx  # Full-screen/sidebar: complete world status + quick tool access + clear
    SessionBar.tsx       # Session UI: create/join/leave sync sessions, status indicator; opens SessionView panel
    SessionView.tsx      # Full-screen/sidebar: session management panel (pairing, managed mode, member list, invites)
    MemberPanel.tsx      # Member list with role badges, admin controls (role change, ban), and invite creation form
    SessionBrowserView.tsx # Full-screen/sidebar: session discovery panel — browse/join listed sessions, create session, enter code/token
    SessionJoinView.tsx  # Full-screen/sidebar: before-you-join comparison view (shows session world state vs local)
    UpdateBanner.tsx     # Fixed bottom banner shown in production when a new app version is detected (polls /api/health every 15 min, compares `data.version` against `__APP_VERSION__`)
    HealthButtonGrid.tsx # 4-column grid of 20 health buttons (5–100%), color-coded
    SortFilterBar.tsx    # Sort/filter controls for the world grid (collapsible)
    SettingsView.tsx     # Full-screen/sidebar settings panel (visual effects + sidebar toggles)
    LightningEffect.tsx  # Canvas-based procedural lightning bolt animation
    SparkEffect.tsx      # GSAP-based ember particle animation (dead trees)
    TipTicker.tsx        # Infinite-scrolling tip footer (tips from data/tips.json)
    ToolButton.tsx       # Icon button used on world cards (w-7 h-6, configurable hover color via toolHover prop)
    ToolView.tsx         # Layout shell for tool views: wraps ViewHeader + children in max-w-lg centered container
    icons/PartyHatGlasses.tsx # Custom SVG icon (party hat + glasses) used as the View nav button
    ui/switch.tsx        # Radix UI switch wrapper
    ui/resizable.tsx     # react-resizable-panels v4 wrappers (shadcn/ui-style handle)
    ui/tooltip.tsx       # Radix UI tooltip wrapper
    ui/combobox.tsx      # @base-ui/react Combobox primitives (base layer for SelectCombobox)
    ui/select-combobox.tsx # High-level combobox: desktop uses combobox.tsx, mobile falls back to native <select>
    ui/split-button.tsx  # Horizontal split button with contextual hover styling per segment; used in SessionBar for paired actions
```

## Layout
CSS Grid with `minmax(128px, 1fr)` — all 137 world cards visible on a 1920×1080 screen without scrolling. Cards are fixed at 85px tall.

The outer shell is `h-screen flex flex-col` so the viewport is always pinned — the world grid (and sidebar, when open) scroll independently within their panels; the page itself never scrolls.

## Sidebar Panel
Uses `react-resizable-panels` v4 (`Group` / `Panel` / `Separator` API — numbers are **pixels** in v4, use strings like `"30%"` for percentages). `src/components/ui/resizable.tsx` provides shadcn/ui-style wrappers (`ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`) plus a re-export of `useDefaultLayout` (not used internally — sidebar sizing is handled manually).

- Panel `defaultSize` starts at 30% and is persisted as a percentage (0–100) to `localStorage` key `ectotrees-sidebar-pct` via `onLayoutChanged` on the Group. `defaultSize` is always passed as a percentage **string** (e.g. `"30%"`) — bare pixel numbers cause the library to crash at mount before the container is in the DOM.
- Panel constraints: sidebar `minSize="365px"`, grid `minSize="300px"` (px strings, no maxSize enforced). The `ResizablePanelGroup` uses `key={settings.sidebarSide}` so switching sides forces a full remount — the new panel reads the stored `sidebarPct` as its `defaultSize`, making the sidebar appear at the same width after a side swap.
- Both `SidebarWrapper` and `FullscreenWrapper` render a **3-section toolbar**: left (dock/expand controls) · center (4 tool-navigation buttons) · right (Close). The center buttons are defined in `NAV_ITEMS` (module-level constant in `App.tsx`) and only render when `worldNavProp` is non-null (i.e. a world tool/detail view is active — not grid or settings). Active button is highlighted `text-amber-400`. `worldNavProp` is `undefined` for the settings view.
- **Tool nav buttons** (`NAV_ITEMS`): `PartyHatGlasses` (custom SVG) View · `Timer` Timer · `TreeDeciduous` Tree · `Skull` Dead. Labels use `hidden sm:inline` — icons only below 640px. On mobile fullscreen, buttons are larger (`h-5 w-5 px-2 py-2`) and left-aligned; on desktop they are smaller (`sm:h-3.5 sm:w-3.5 sm:px-1.5 sm:py-1`) and centered via `sm:absolute sm:left-1/2 sm:-translate-x-1/2`.
- `SidebarWrapper` toolbar uses `grid grid-cols-[1fr_auto_1fr]`; `FullscreenWrapper` toolbar uses `relative flex` (left-aligned on mobile, absolute-centered nav on desktop).
- `[&>*]:!min-h-full` on the scroll container overrides the `min-h-screen` class on view root divs so they fill the panel height rather than forcing `100vh`
- `useIsMobile()` (`src/hooks/useIsMobile.ts`) reactively watches `window.matchMedia('(max-width: 639px)')` and forces full-screen mode below 640px (Tailwind `sm`) regardless of the setting — tablets (≥ 640px) can use the sidebar
- The `FullscreenWrapper` component wraps every non-grid fullscreen view. Its top bar is constrained to `max-w-lg mx-auto`. On mobile `showDockControls={false}` so no `PanelLeft` / `PanelRight` buttons appear; clicking a dock button sets `sidebarEnabled: true` and the chosen `sidebarSide` in one action.

## Navigation (App.tsx)
`activeView` discriminated union drives what is rendered:
```typescript
type ActiveView =
  | { kind: 'grid' }
  | { kind: 'spawn' | 'tree' | 'dead' | 'detail'; worldId: number }
  | { kind: 'settings' }
  | { kind: 'session' }
  | { kind: 'session-join'; code: string };
```
Tool views (`spawn`, `tree`, `dead`) return to grid on submit/cancel. `detail` is opened by clicking a card body; the detail view exposes all three tools directly. `settings` is opened from the ⚙ button in the header. `session` is opened from the `SessionBar` (clicking the session code, the Shield member count button, or the ExternalLink icon) and renders `SessionView` — a full panel for pairing, managed mode, member management, and invites. `session-join` is shown when joining a session that has existing state — it renders `SessionJoinView` to let the user compare and decide whether to contribute their local data.

**World search bar**: a `Search` icon input in the header filters the grid by world number. When the search matches exactly one world and sidebar mode is enabled, it auto-opens the detail view for that world. Escape clears the search.

**Sidebar mode** (opt-in, available on screens ≥ 640px): when `settings.sidebarEnabled` is true and the viewport is ≥ 640px, any non-grid `activeView` renders in a resizable panel beside the world grid instead of replacing it. `useSidebar = settings.sidebarEnabled && !isMobile && activeView.kind !== 'grid'`. On mobile or when disabled, the original full-screen behaviour is unchanged.

## Sort & Filter Bar (SortFilterBar.tsx)
The grid has a collapsible sort/filter bar. A toggle button collapses it to a summary line of active filter pills (collapsed state persisted to `localStorage`). When expanded, there are four sections:
- **Sort buttons**: W#, Soonest/Latest, Favorite, Health (with asc/desc toggle; clicking an active button toggles direction)
  - `Soonest/Latest` sorts by the next relevant timestamp across urgency buckets: dead trees → alive/mature → saplings → spawn timers → inactive
- **Filter chips**: Favorite, P2P, F2P (boolean toggles; P2P/F2P are mutually exclusive), Hidden (tri-state: off = exclude hidden worlds, Show = include hidden, Only = show only hidden)
- **Tree type filter chips**: Unknown, Sapling, Tree, Oak, Willow, Maple, Yew, Magic, Elder (multi-select; defined in `FILTERABLE_TREE_TYPES` in `constants/evilTree.ts`)
- **Info tri-state filter chips**: Intel, Hint, Location, Health — each cycles through three states: off → **Needs** (show only worlds missing that info) → **Has** (show only worlds that have it)

Tree type filters show only worlds with a matching confirmed tree type. The "Unknown" chip matches sapling, mature, and worlds with no confirmed type. When any tree type filter is active, inactive worlds (no data, no spawn) are hidden.

All sort/filter preferences are persisted to `localStorage` (`evilTree_sort`, `evilTree_filters`).

## Tool Availability
| Tool | Enabled when |
|---|---|
| ⏱ Spawn timer | Always |
| 🌳 Tree info | Always |
| ☠ Mark dead | Always |
| Clear world state | When world has any active state (link in WorldDetailView) |

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

Exposes `createSession`, `joinSession`, `rejoinSession`, `leaveSession`, a preview-join flow (`previewJoin` / `confirmPreviewJoin` / `cancelPreview`), managed session ops (`forkToManaged`, `joinManagedFork`, `createInvite`, `kickMember`, `banMember`, `renameMember`, `setMemberRole`, `transferOwnership`, `setAllowViewers`, `setAllowOpenJoin`, `openJoin`, `updateSessionSettings`), and personal token ops (`requestPersonalToken`, `joinByInviteToken`).

Key behaviors:
- **localStorage**: session code → `evilTree_sessionCode`; invite/personal token → `evilTree_inviteToken`. Both are auto-resumed on page reload.
- **URL fragments**: `#join=CODE` auto-joins on load; `#identity=TOKEN` triggers an identity-based join. Fragments are removed from history after use.
- **Reconnection**: exponential backoff via `shared/reconnect.ts` (`[1s, 2s, 4s, 8s, 16s, 30s]`, max 10 attempts). Fatal errors (`Session is full.`, `Session not found.`) skip reconnection. On reconnect, invite token takes priority over session code for auth.
- **Ping/pong**: ping every 30s; socket force-closed if no pong within 8s.
- **ACK system**: every mutation tagged with `msgId`; socket force-closed if no `ack` within 5s. Pending mutations replayed in order on reconnect.
- **SyncChannel**: the hook returns a `SyncChannel` passed into `useWorldStates` — when non-null, localStorage writes are skipped and the server is the source of truth; mutations are applied optimistically client-side.
