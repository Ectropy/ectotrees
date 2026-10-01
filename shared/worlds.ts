import worldsData from './worlds.json' with { type: 'json' };
import type { WorldConfig } from './types.ts';

/**
 * Leagues is a seasonal event, so its worlds are gated by the `leaguesWindow` in
 * worlds.json rather than being added and deleted each year. Outside the window
 * every consumer (client grid, server validation, Alt1 OCR) behaves as if the
 * Leagues entries didn't exist.
 *
 * Gating is evaluated per call, not once at load — the server and open tabs are
 * long-lived, and a startup snapshot would keep Leagues alive past its end date
 * until the next restart or reload.
 */
export interface LeaguesWindow {
  /** ms timestamp, inclusive */
  start: number;
  /** ms timestamp, exclusive */
  end: number;
}

/** Missing or malformed windows parse to `null`, which means "Leagues is off". */
export function parseLeaguesWindow(raw: unknown): LeaguesWindow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { start, end } = raw as Record<string, unknown>;
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return null;
  return { start: s, end: e };
}

/** Every configured world, Leagues included. Use for lookups, not for display. */
export const ALL_WORLDS = worldsData.worlds as WorldConfig[];
export const LEAGUES_WINDOW = parseLeaguesWindow(
  (worldsData as { leaguesWindow?: unknown }).leaguesWindow,
);

const NON_LEAGUES_WORLDS = ALL_WORLDS.filter(w => !w.leagues);
const NON_LEAGUES_IDS = new Set(NON_LEAGUES_WORLDS.map(w => w.id));
const ALL_IDS = new Set(ALL_WORLDS.map(w => w.id));

export function isLeaguesActive(now = Date.now(), window = LEAGUES_WINDOW): boolean {
  return window !== null && now >= window.start && now < window.end;
}

/** Returns one of two stable arrays, so it is safe as a memo dependency. */
export function worldList(leaguesActive: boolean): WorldConfig[] {
  return leaguesActive ? ALL_WORLDS : NON_LEAGUES_WORLDS;
}

/** The world list in effect at `now`. */
export function activeWorlds(now = Date.now()): WorldConfig[] {
  return worldList(isLeaguesActive(now));
}

export function isActiveWorldId(id: number, now = Date.now()): boolean {
  return (isLeaguesActive(now) ? ALL_IDS : NON_LEAGUES_IDS).has(id);
}

/** ms until Leagues next opens or closes, or `null` if no boundary is still ahead. */
export function msUntilNextLeaguesBoundary(now = Date.now(), window = LEAGUES_WINDOW): number | null {
  if (window === null) return null;
  if (now < window.start) return window.start - now;
  if (now < window.end) return window.end - now;
  return null;
}
