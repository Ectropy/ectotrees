# Shared (`shared/`)

Pure TypeScript code shared between client and server — the single source of truth for types, constants, protocol, and state mutations.

## File Structure

```
shared/
  types.ts              # TreeType, WorldState, WorldStates, timing constants (SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS, LIGHTNING_1_MS, LIGHTNING_2_MS, HEALTH_LIGHTNING_1, HEALTH_LIGHTNING_2), payload interfaces
  protocol.ts           # ClientMessage and ServerMessage discriminated unions; also exports MemberRole, MemberInfo, and SessionSummary interfaces
  mutations.ts          # Pure functions (applySetSpawnTimer, applySetTreeInfo, applyUpdateTreeFields, applyUpdateHealth, applyMarkDead, applyClearWorld, applyReportLightning, applyTransitions) that take a WorldStates map and return a new one
  hints.ts              # LOCATION_HINTS: array of 19 LocationHint objects ({ hint, locations }) — in-game location hints → arrays of possible exact locations, used in TreeInfoView and WorldDetailView
  reconnect.ts          # RECONNECT_DELAYS, MAX_RECONNECT_ATTEMPTS, formatReconnectMessage() — shared reconnection constants and helper
  __tests__/
    mutations.test.ts   # Vitest unit tests for all mutation functions
```

`src/types/index.ts` and `src/constants/evilTree.ts` re-export from `shared/types.ts`.
