/**
 * The in-game spawn timer ("another evil tree in approximately N minutes") rounds
 * DOWN, with a minimum of 1: a reading of N means the tree spawns N:00–N:59 from
 * when the dialog was shown, and "1 minute" covers 0:00–1:59. Measured by the Evil
 * Trees RS3 plugin against watched spawns (W204/W205 beta worlds, Nov 2026).
 *
 * Treating the reading as exact (spawn = now + N) predicts the earliest possible
 * spawn, 30 s early on average. We predict the middle of the window instead.
 */
export const SPAWN_READING_MIDPOINT_MS = 30_000;

/**
 * Best estimate of ms until spawn for an in-game timer reading of `readingMs`
 * (whole minutes, as shown in the dialog), sent `elapsedMs` after the dialog was
 * read. The result is what `setSpawnTimer.msFromNow` carries; the server adds it
 * to its own clock as-is.
 *
 * Always at least 1 ms, since a stale reading can't move the spawn into the past
 * (the spawn-timer transition then fires on the next tick).
 */
export function spawnMsFromReading(readingMs: number, elapsedMs = 0): number {
  // "1 minute" spans 0:00–1:59, so its midpoint is the reading itself.
  const midpoint = readingMs <= 60_000 ? readingMs : readingMs + SPAWN_READING_MIDPOINT_MS;
  return Math.max(1, Math.round(midpoint - elapsedMs));
}
