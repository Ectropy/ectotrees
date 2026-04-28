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

import { LOCATION_HINTS, findExactLocationFromSpiritTreeClue } from '@shared/hints';
import type { TreeType } from '@shared/types';

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
 *   "approximately 0 minutes"              → 60 * 60_000  (game quirk: 0 min means 60 min)
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
  // Edge case: "approximately 0 minutes" is a game quirk meaning 60 minutes.
  const minsOnly = text.match(/approximately\s+(\d+)\s+minutes?/i);
  if (minsOnly) {
    const mins = parseInt(minsOnly[1], 10);
    return (mins === 0 ? 60 : mins) * 60_000;
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
  // Capture everything after "It can be found" up to the sentence-ending period.
  // [\s\S]+? crosses newlines — scanner.ts joins dialog lines with \n, so a hint
  // that wraps across two visual lines arrives as "...call\n'Draynor'." and the
  // old (.+?) regex would stop at the \n, silently dropping the second line.
  // Fall back to end-of-string if no period is present (genuine OCR truncation).
  const match = text.match(/It\s+can\s+be\s+found\s+([\s\S]+?)\./) ??
                text.match(/It\s+can\s+be\s+found\s+([\s\S]+?)$/i);
  if (!match) return null;
  // Normalize any embedded newlines (line-wrap artefacts) to single spaces.
  const hint = match[1].trim().replace(/\s*\n\s*/g, ' ');
  if (hint.length === 0) return null;
  // Capitalize first letter to match the LOCATION_HINTS canonical format.
  const parsed = hint.charAt(0).toUpperCase() + hint.slice(1);

  // Alt1 OCR sometimes misses the second line of a chat message, leaving the
  // hint truncated (e.g. "In the lands inhabited by" instead of "In the lands
  // inhabited by elves"). Try to recover by prefix-matching against canonical
  // hints — if exactly one canonical hint starts with the parsed text, return
  // the full canonical string. Require at least 8 chars to avoid false positives.
  const lower = parsed.toLowerCase();
  if (lower.length >= 8) {
    const matches = LOCATION_HINTS.filter(h => h.hint.toLowerCase().startsWith(lower));
    if (matches.length === 1) return matches[0].hint;
  }

  return parsed;
}

// ── Tree just died (Spirit Tree timer page, no time given) ───────────────────

/**
 * Detects "the previous evil tree is dead" dialog text. Two NPCs use the
 * same closing sentence — anchoring on it covers both:
 *
 *   Spirit Tree (prespawn greeting branch):
 *     "The taint of the evil tree is not currently on the land. There won't
 *      be another evil tree for a long time."
 *
 *   Nature's Sentinel Helm (right-click → Contact):
 *     "There are no nasty spirits possessing trees right now. There won't be
 *      another evil tree for a long time."
 *
 * This text only appears between the previous tree's death and the moment a
 * new spawn timer becomes known to the game (the 10-minute fallen-tree
 * reward window). Crucially, parseSpawnTime returns null in this case —
 * there's no "approximately X minutes" — so the two parsers never conflict.
 *
 * The apostrophe regex tolerates straight, curly, or missing apostrophes
 * (OCR sometimes drops them).
 */
export function parseTreeDead(text: string): boolean {
  return /won['’]?t\s+be\s+another\s+evil\s+tree\s+for\s+a\s+long\s+time/i.test(text);
}

// ── Greeting mode (Spirit Tree first line) ───────────────────────────────────

/**
 * Detects which Spirit Tree greeting branch the dialog opened with. The
 * greetings share their first sentence ("If you are a friend of the gnome
 * people..."), and only differ on the closing question:
 *
 *   prespawn  — "...do you wish to ask about the evil tree?"
 *               (no tree currently spawned, OR the previous tree is dead)
 *
 *   postspawn — "...are you here to help dispatch the evil tree?"
 *               (an evil tree is currently alive on this world)
 *             — "...are you interested in the strange sapling?"
 *               (a strange sapling exists; collapsed into postspawn since the
 *                same form handles both — sapling species are valid TreeType
 *                values)
 *
 * Returns null when no greeting phrase appears (e.g. dialog page 2 just
 * showing the timer or hint, or unrelated text).
 */
export function parseGreetingMode(text: string): 'prespawn' | 'postspawn' | null {
  if (/dispatch\s+the\s+evil\s+tree/i.test(text)) return 'postspawn';
  if (/strange\s+sapling/i.test(text)) return 'postspawn';
  if (/ask\s+about\s+the\s+evil\s+tree/i.test(text)) return 'prespawn';
  return null;
}

// ── Post-spawn exact location (Spirit Tree) ──────────────────────────────────

/**
 * Parses the Spirit Tree's post-spawn dialog (shown once an evil tree has
 * appeared) for a clue that maps to one specific exact location. Returns the
 * canonical location key from LOCATION_COORDS, or null if no clue matches.
 *
 * Example dialog:
 *   "It is an abomination of nature, which has appeared beside the road
 *    south of the Tree Gnome Stronghold. You should go there immediately
 *    to help."
 *
 * The clue → location mapping is data — `spiritTreeClue` fields on entries
 * in `LOCATION_COORDS` (shared/hints.ts). Add a new entry there as you
 * encounter each in-game phrasing.
 */
export function parsePostSpawnLocation(text: string): string | null {
  return findExactLocationFromSpiritTreeClue(text);
}

// ── Sentinel Helm tree species ───────────────────────────────────────────────

const SPECIES_TREE_TYPES = ['oak', 'willow', 'maple', 'yew', 'magic', 'elder'] as const;

/**
 * Parses the Nature's Sentinel Helm dialog (and any other in-game text that
 * names the active evil tree's species) for a TreeType. Returns the species,
 * or null if no species is named.
 *
 * Example dialogs:
 *   "Nasty spirits have got a magic tree. It can be found to the south of
 *    a tree gnome settlement."
 *     → 'magic'
 *
 *   "Nasty spirits have got at an elder tree sapling. It can be found north
 *    as the crow flies from Seers' Village."
 *     → 'sapling-elder'
 *
 * Sapling-species variants must be checked before the bare-species pass —
 * otherwise `\belder\s+tree\b` matches inside "elder tree sapling" and
 * mis-returns the mature 'elder' variant.
 *
 * Falls through to the generic 'sapling' / 'tree' TreeTypes when the dialog
 * mentions a sapling/tree but not its species.
 */
export function parseSentinelTreeType(text: string): TreeType | null {
  for (const species of SPECIES_TREE_TYPES) {
    if (new RegExp(`\\b${species}\\s+tree\\s+sapling\\b`, 'i').test(text)) {
      return `sapling-${species}` as TreeType;
    }
  }
  for (const species of SPECIES_TREE_TYPES) {
    if (new RegExp(`\\b${species}\\s+tree\\b`, 'i').test(text)) {
      return species;
    }
  }
  if (/\bsapling\b/i.test(text)) return 'sapling';
  if (/\bgot\s+(?:at\s+)?an?(?:\s+evil)?\s+tree\b/i.test(text)) return 'tree';
  return null;
}
