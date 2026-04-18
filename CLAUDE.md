# Ectotrees — Evil Tree Tracker

A RuneScape 3 dashboard for tracking the Evil Trees Distraction & Diversion across all 137 worlds in real time.

## Tech Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v3** (not v4)
- **lucide-react** — icon library (`PanelLeft`, `PanelRight`, `Expand`, `X`, `Timer`, `TreeDeciduous`, `Skull`, `Search` used in sidebar/fullscreen toolbars and header; `Settings`, `Star`, `EyeOff`, `Pencil`, `Lightbulb`, `Check`, `ChevronUp`, `ChevronDown` used elsewhere; `Zap` used in `HealthButtonGrid`; `Link2`, `Users`, `Copy`, `ExternalLink`, `HelpCircle` used in session UI; `RefreshCw` used in `SessionBrowserView`; `Circle`, `CircleX`, `LoaderCircle` used in `SessionBar`; `Link`, `Unlink` used in `Alt1TokenButton` and `SessionView`) — Note: the View nav button uses the custom `PartyHatGlasses` SVG icon (`src/components/icons/PartyHatGlasses.tsx`), not a lucide icon
- **obscenity** — profanity filter used server-side to sanitize member names and session descriptions (`server/profanity.ts`)
- **@ncdai/react-wheel-picker** — scroll-wheel time picker used in `SpawnTimerView`
- **@base-ui/react** — headless Combobox primitive used in `SelectCombobox` (hint/location pickers)
- **@radix-ui/react-tooltip** — tooltip primitive wrapped in `ui/tooltip.tsx`
- **@radix-ui/react-popover** — Popover primitive wrapped in `ui/popover.tsx`
- **@radix-ui/react-switch** — Switch primitive wrapped in `ui/switch.tsx`
- **react-resizable-panels** — resizable panel layout wrapped in `ui/resizable.tsx`
- **gsap** — animation library used in `SparkEffect`
- **@tailwindcss/container-queries** + **tailwindcss-animate** — Tailwind CSS plugins
- **Express 5** + **ws** — backend server for real-time multi-user sync
- **tsx** — runs TypeScript server files directly
- Node 24.x LTS (`.nvmrc` pins to `24`; run `nvm use` to switch)

## Commands

```bash
npm run dev          # start Vite dev server (http://localhost:5173)
npm run host         # dev server + alt1-plugin watch, exposed to network (concurrently)
npm run build        # tsc -b && vite build && alt1-plugin build (sequential)
npm run lint         # eslint
npx tsc --noEmit     # type-check client only (run after every change)
npm run server       # start backend server (tsx server/index.ts, http://localhost:3001)
npm run server:check # type-check server only (npx tsc --noEmit -p server/tsconfig.json)
npm run typecheck    # type-check client + server (both in sequence)
npm test             # run vitest unit tests (mutations + validation)
npm run test:watch   # vitest in watch mode
npm run test:e2e     # run Playwright E2E tests (auto-starts dev server)
npm run test:e2e:ui  # Playwright visual test runner UI
```

In development, run `npm run server` and `npm run dev` in two terminals. Vite proxies `/api` and `/ws` to `localhost:3001`.

## Project Layout

| Directory | Purpose |
|---|---|
| `shared/` | Pure TS shared between client and server — types, protocol, mutations, hints |
| `shared-browser/` | Browser + React utilities shared between `src/` and `alt1-plugin/` (clipboard, `useCopyFeedback`, `buildIdentityUrl`, `useNow`, `useCountdown`). Not imported by server. |
| `server/` | Express 5 + WebSocket backend — sessions, validation, real-time sync |
| `src/` | React client — dashboard UI, hooks, components |
| `alt1-plugin/` | Alt1 Toolkit scout plugin — separate Vite app served at `/alt1` |
| `e2e/` | Playwright E2E tests |
| `scripts/` | Build/release scripts (`update-docs.mjs`, `generate-release-notes.mjs`) |

Each directory with a CLAUDE.md has detailed file listings and architecture docs scoped to that area.

## Core Domain (shared by client and server)

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
- `applyUpdateTreeFields` clears `treeExactLocation` when `treeHint` changes (unless a new exact location is explicitly provided in the same update), because location options depend on the selected hint.

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

## Adding/Removing Worlds
Edit `src/data/worlds.json`. Format: `{ "worlds": [{ "id": 1, "type": "P2P" }, ...] }`
