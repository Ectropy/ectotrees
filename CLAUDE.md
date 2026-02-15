# Ectotrees — Evil Tree Tracker

A RuneScape 3 dashboard for tracking the Evil Trees Distraction & Diversion across all 137 worlds in real time.

## Tech Stack

- **React 18** + **TypeScript** + **Vite 5**
- **Tailwind CSS v3** (not v4)
- **TanStack Query** — reserved for phase 2 backend sync; not yet installed
- Node 18.x (v18.16.1 on this machine — some ESLint packages warn about engine mismatch, ignore those)

## Commands

```bash
npm run dev      # start dev server (Vite, usually http://localhost:5173)
npm run build    # tsc -b && vite build
npm run lint     # eslint
npx tsc --noEmit # type-check only (run after every change)
```

## Project Structure

```
src/
  data/worlds.json        # User-editable world config — add/remove worlds here
  constants/evilTree.ts   # Tree types, location hints, timing constants (single source of truth)
  types/index.ts          # Shared TypeScript types
  hooks/useWorldStates.ts # Core state: localStorage persistence + auto-transitions
  components/
    WorldCard.tsx         # Card shell (85px tall, clickable body opens WorldDetailView)
    StatusSection.tsx     # Compact in-card status display with countdowns
    SpawnTimerTool.tsx    # ⏱ button — navigates to SpawnTimerView
    TreeInfoTool.tsx      # 🌳 button — navigates to TreeInfoView
    TreeDeadTool.tsx      # ☠ button — navigates to TreeDeadView
    SpawnTimerView.tsx    # Full-screen: set spawn countdown + optional location hint
    TreeInfoView.tsx      # Full-screen: record tree type, hint, exact location
    TreeDeadView.tsx      # Full-screen: confirm mark-dead (starts 30-min reward window)
    WorldDetailView.tsx   # Full-screen: complete world status + quick tool access + clear
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

### State Model (per world, in `useWorldStates`)
```typescript
{
  treeStatus: 'none' | 'sapling' | 'mature' | 'alive' | 'dead'
  nextSpawnTarget?: number  // ms timestamp — when spawn is expected
  spawnSetAt?: number       // ms timestamp — when spawn timer was set
  treeType?: TreeType
  treeHint?: string
  treeExactLocation?: string
  treeHealth?: number         // 5–100 in increments of 5 (optional)
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
- Auto-transitions use exact timestamps for `deadAt` (e.g., `matureAt + 30min`), not `Date.now()`, to avoid drift from the 10-second poll interval.
- `clearWorld(worldId)` deletes the key from state entirely; the grid fallback `?? { treeStatus: 'none' }` handles the missing key.

### Auto-Transitions (checked every 10 seconds via `setInterval`)
- **Sapling → Mature**: 5 minutes after `treeSetAt`
- **Mature/Alive → Dead**: 30 minutes after `matureAt`
- **Dead → None**: 10 minutes after `deadAt` (fallen tree reward window)
- **Spawned → None**: 35 minutes after `nextSpawnTarget` (clears "Spawned!" notification)

### Tree Types
`sapling` | `mature` (auto-transition, type unknown) | `tree` | `oak` | `willow` | `maple` | `yew` | `magic` | `elder`

### Sort & Filter Bar (SortFilterBar.tsx)
The grid has a sort/filter bar with three sections:
- **Sort buttons**: W#, Active, Spawn, Ending, Favorite (with asc/desc toggle)
- **Filter chips**: Favorite, Active, No data, P2P, F2P (boolean toggles; Active/No data are mutually exclusive, P2P/F2P are mutually exclusive)
- **Tree type filter chips**: Unknown, Tree, Oak, Willow, Maple, Yew, Magic, Elder (multi-select; defined in `FILTERABLE_TREE_TYPES` in `constants/evilTree.ts`)

Tree type filters show only worlds with a matching confirmed tree type. The "Unknown" chip matches sapling, mature, and worlds with no confirmed type. When any tree type filter is active, inactive worlds (no data, no spawn) are hidden.

All sort/filter preferences are persisted to `localStorage` (`evilTree_sort`, `evilTree_filters`).

### Tool Availability
| Tool | Enabled when |
|---|---|
| ⏱ Spawn timer | Always |
| 🌳 Tree info | Always |
| ☠ Mark dead | Always |
| Clear world state | When world has any active state (link in WorldDetailView) |

## Adding/Removing Worlds
Edit `src/data/worlds.json`. Format: `{ "worlds": [{ "id": 1, "type": "P2P" }, ...] }`

## Phase 2 (Not Yet Implemented)
Backend sync so multiple users see the same state in real time. Plan to use TanStack Query for server communication. The `useWorldStates` hook will be the integration point.
