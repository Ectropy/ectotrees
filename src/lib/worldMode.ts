import type { WorldConfig } from '../types';

/**
 * Main vs. Leagues is a *mode*, not a filter: each mode is its own dashboard with
 * its own grid, scouted counter, and intel export. It deliberately lives outside
 * `Filters` so that "Clear filters" can't strand the user in the wrong world set.
 *
 * "Leagues" is orthogonal to `type` — Leagues has both P2P and F2P worlds — so the
 * P2P/F2P chips keep working unchanged within whichever mode is active.
 */
export type WorldMode = 'main' | 'leagues';

export const WORLD_MODE_STORAGE_KEY = 'evilTree_worldMode';
export const LEAGUES_SEEN_STORAGE_KEY = 'evilTree_leaguesSeen';

export interface PartitionedWorlds {
  main: WorldConfig[];
  leagues: WorldConfig[];
}

/** Split the world list by mode, preserving the source ordering within each set. */
export function partitionWorlds(worlds: WorldConfig[]): PartitionedWorlds {
  const main: WorldConfig[] = [];
  const leagues: WorldConfig[] = [];
  for (const world of worlds) {
    (world.leagues ? leagues : main).push(world);
  }
  return { main, leagues };
}

export function worldModeFor(world: WorldConfig): WorldMode {
  return world.leagues ? 'leagues' : 'main';
}

export function normalizeWorldMode(value: unknown): WorldMode {
  return value === 'leagues' ? 'leagues' : 'main';
}

/**
 * `hasLeagues` guards against a stale stored 'leagues' stranding the user on a blank
 * grid after the event ends and the Leagues entries are deleted from worlds.json.
 */
export function loadWorldMode(hasLeagues: boolean): WorldMode {
  if (!hasLeagues) return 'main';
  try {
    return normalizeWorldMode(localStorage.getItem(WORLD_MODE_STORAGE_KEY));
  } catch {
    return 'main';
  }
}

export function loadLeaguesSeen(): boolean {
  try {
    return localStorage.getItem(LEAGUES_SEEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
