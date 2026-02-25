/**
 * Text parsers for Spirit Tree dialog content.
 *
 * The Spirit Tree NPC dialog has two relevant pages:
 *
 * Page 1 (timer):
 *   "The taint of the evil tree is not currently on the land. There will be
 *    another evil tree in approximately 1 hour and 10 minutes."
 *
 * Page 2 (hint):
 *   "It can be found in the lands inhabited by elves."
 *
 * Both parsers return null if the input doesn't match — callers should
 * preserve the last known value when a scan returns a non-matching page.
 */

// ── Spawn timer ─────────────────────────────────────────────────────────────

/**
 * Parses "approximately X hour(s) and Y minutes" from Spirit Tree dialog text.
 * Returns the duration in milliseconds, or null if no match.
 *
 * Handles:
 *   "approximately 1 hour and 10 minutes"  → 70 * 60_000
 *   "approximately 2 hours"                → 120 * 60_000
 *   "approximately 1 hour"                 → 60 * 60_000
 *   "approximately 45 minutes"             → 45 * 60_000
 */
export function parseSpawnTime(text: string): number | null {
  // "X hours and Y minutes" (most common format)
  const full = text.match(/approximately\s+(\d+)\s+hours?\s+and\s+(\d+)\s+minutes?/i);
  if (full) {
    return (parseInt(full[1], 10) * 60 + parseInt(full[2], 10)) * 60_000;
  }

  // "X hours" only (no minutes component)
  const hoursOnly = text.match(/approximately\s+(\d+)\s+hours?(?!\s+and)/i);
  if (hoursOnly) {
    return parseInt(hoursOnly[1], 10) * 3_600_000;
  }

  // "Y minutes" only
  const minsOnly = text.match(/approximately\s+(\d+)\s+minutes?/i);
  if (minsOnly) {
    return parseInt(minsOnly[1], 10) * 60_000;
  }

  return null;
}

/**
 * Decomposes a millisecond duration into { hours, minutes } for display.
 * Minutes are rounded to the nearest whole number; hours are floored.
 */
export function msToHoursMinutes(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.round(ms / 60_000);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

// ── Location hint ────────────────────────────────────────────────────────────

/**
 * Parses "It can be found [hint text]" from Spirit Tree dialog text.
 * Returns the hint portion (the part after "found"), or null if no match.
 *
 * Examples:
 *   "It can be found in the lands inhabited by elves."
 *     → "in the lands inhabited by elves"
 *
 *   "It can be found near a large body of water in the south."
 *     → "near a large body of water in the south"
 */
export function parseHint(text: string): string | null {
  // Capture everything after "It can be found" up to end of sentence (period or newline)
  const match = text.match(/It\s+can\s+be\s+found\s+(.+?)(?:[.\n]|$)/i);
  if (!match) return null;
  const hint = match[1].trim();
  if (hint.length === 0) return null;
  // Capitalize first letter to match the LOCATION_HINTS canonical format.
  return hint.charAt(0).toUpperCase() + hint.slice(1);
}
