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
```

## Project Structure

```
src/
  data/worlds.json        # User-editable world config — add/remove worlds here
  constants/evilTree.ts   # Tree types, location hints, timing constants (single source of truth)
  types/index.ts          # Shared TypeScript types
  hooks/useWorldStates.ts # Core state: localStorage persistence + auto-transitions
  components/
    WorldCard.tsx         # Card shell (85px tall, manages which tool modal is open)
    StatusSection.tsx     # Displays current tree state with countdowns
    SpawnTimerTool.tsx    # Tool 1: spawn countdown
    TreeInfoTool.tsx      # Tool 2: tree type + location
    TreeDeadTool.tsx      # Tool 3: mark dead (with confirm popover)
    TimePickerModal.tsx   # Hours/minutes picker for Tool 1
    TreeInfoModal.tsx     # Type + hint + exact location form for Tool 2
```

## Key Architecture Decisions

### Layout
CSS Grid with `minmax(128px, 1fr)` — all 137 world cards visible on a 1920×1080 screen without scrolling. Cards are fixed at 85px tall.

### State Model (per world, in `useWorldStates`)
```typescript
{
  treeStatus: 'none' | 'sapling' | 'mature' | 'alive' | 'dead'
  nextSpawnTarget?: number  // ms timestamp
  treeType?: TreeType
  treeHint?: string
  treeExactLocation?: string
  treeSetAt?: number
  matureAt?: number
  deadAt?: number
}
```

### State Invariants
- `nextSpawnTarget` and any active tree state are **mutually exclusive** (game mechanic: dead tree = no known next spawn). `markDead`, `setTreeInfo`, and auto-transitions all enforce this.
- Tool 1 (spawn timer) is **always enabled** — using it while dead clears the dead state (correction path).
- Auto-transitions use exact timestamps for `deadAt` (e.g., `matureAt + 30min`), not `Date.now()`, to avoid drift from the 10-second poll interval.

### Auto-Transitions (checked every 10 seconds via `setInterval`)
- **Sapling → Mature**: 5 minutes after `treeSetAt`
- **Mature/Alive → Dead**: 30 minutes after `matureAt`
- **Dead → None**: 30 minutes after `deadAt` (fallen tree reward window)

### Tree Types
`sapling` | `mature` (auto-transition, type unknown) | `tree` | `oak` | `willow` | `maple` | `yew` | `magic` | `elder`

### Tool Availability
| Tool | Enabled when |
|---|---|
| ⏱ Spawn timer | Always |
| 🌳 Tree info | `none`, `mature`, `alive` |
| ☠ Mark dead | `sapling`, `mature`, `alive` |

## Adding/Removing Worlds
Edit `src/data/worlds.json`. Format: `{ "worlds": [{ "id": 1, "type": "P2P" }, ...] }`

## Phase 2 (Not Yet Implemented)
Backend sync so multiple users see the same state in real time. Plan to use TanStack Query for server communication. The `useWorldStates` hook will be the integration point.
