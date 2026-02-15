# Ecto Trees — Evil Tree Tracker for turning Evil Trees into dead trees.

A RuneScape 3 dashboard for coordinating the **Evil Trees** Distraction & Diversion across all 137 worlds in real time.

## What it does

Evil Trees spawn in waves across RS3 worlds. This tool lets you (and potentially a group of players) track the state of every world's tree on one screen:

- **137 world cards** displayed in a compact grid — all visible at once on a 1080p monitor
- Per-world **status tracking**: no tree → sapling → mature → alive → dead → (cycle repeats)
- **Automatic state transitions** based on known game timings (sapling matures at 5 min, tree dies at 30 min, fallen tree despawns at 10 min after death)
- Three tools on every card:
  - **Spawn timer** — set a countdown to the next expected spawn, with optional location hint
  - **Tree info** — record tree type, location hint, and exact location
  - **Mark dead** — mark a tree as dead with one click (with confirmation)
- **Click any card** to open a full-screen detail view showing the complete status (tree type, full location, live countdowns). All three tools are accessible directly from the detail view, and a **clear world state** option lets you instantly reset a world if you recorded information on the wrong one
- **Sort & filter bar** with multiple options:
  - Sort by world number, active status, spawn time, ending time, or favorites
  - Filter by favorites, active/no-data, P2P/F2P
  - **Tree type filters** — filter the grid by tree species (Unknown, Tree, Oak, Willow, Maple, Yew, Magic, Elder) so you can focus on the trees you want to cut
- State persists in `localStorage` between sessions

## Getting started

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Start the dev server (http://localhost:5173)
npm run dev
```

## Other commands

```bash
npm run build   # production build (output in dist/)
npm run lint    # run ESLint
npx tsc --noEmit  # type-check without building
```

## Customising worlds

Edit [src/data/worlds.json](src/data/worlds.json) to add or remove worlds:

```json
{ "worlds": [{ "id": 1, "type": "P2P" }, { "id": 2, "type": "F2P" }] }
```

## Tech stack

- React 18 + TypeScript + Vite 5
- Tailwind CSS v3
- No backend — all state is local (`localStorage`)
