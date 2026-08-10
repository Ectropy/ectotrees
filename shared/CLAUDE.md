# Shared (`shared/`)

Pure TypeScript code shared between client and server — the single source of truth for types, constants, protocol, and state mutations.

## File Structure

```
shared/
  worlds.json           # User-editable world config (add/remove worlds here) — imported by client, server, and alt1-plugin. Entries are { id, type: 'P2P' | 'F2P', leagues?: true }; `leagues` is orthogonal to `type` (Leagues has both P2P and F2P worlds). See "Adding/Removing Worlds" in the root CLAUDE.md for the required restart/rebuild order
  types.ts              # TreeType, WorldState, WorldStates, timing constants (SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS, LIGHTNING_1_MS, LIGHTNING_2_MS, HEALTH_LIGHTNING_1, HEALTH_LIGHTNING_2), payload interfaces
  protocol.ts           # ClientMessage and ServerMessage discriminated unions; also exports MemberRole, MemberInfo, SessionInfo (per-connection session metadata; name optional), SessionSummary (extends SessionInfo with required name — the browser-listed shape), and MAX_MEMBER_NAME_LEN (client-side input cap for member names)
  mutations.ts          # Pure functions (applySetSpawnTimer, applySetTreeInfo, applyUpdateTreeFields, applyUpdateHealth, applyMarkDead, applyClearWorld, applyReportLightning, applyTransitions) that take a WorldStates map and return a new one. Mutations that accept a treeHint auto-resolve treeExactLocation for single-location hints (resolveLocation helper wrapping hints.ts resolveExactLocation) — explicit payload locations always win
  hints.ts              # LOCATION_HINTS: array of 20 LocationHint objects ({ hint, locations }) — in-game location hints → arrays of possible exact locations, used in TreeInfoView and WorldDetailView. Also exports LOCATION_COORDS: Record<location, { x, y, spiritTreeClue? }> mapping each unique exact location to RS3 game coordinates (sourced from runescape.wiki/Evil_Tree) and an optional Spirit Tree post-spawn dialog substring used for OCR-based location resolution, used by MapView to place pins. Helper exports: findExactLocationFromSpiritTreeClue(text), hintForLocation(location), locationsForHint(hint), resolveExactLocation(hint).
  reconnect.ts          # RECONNECT_DELAYS, MAX_RECONNECT_ATTEMPTS, formatReconnectMessage() — shared reconnection constants and helper
  __tests__/
    mutations.test.ts   # Vitest unit tests for all mutation functions
```

`src/types/index.ts` and `src/constants/evilTree.ts` re-export from `shared/types.ts`.
