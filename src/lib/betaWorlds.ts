import type { WorldConfig, WorldStates } from '../types';
import { NONE_STATE, isActive } from './worldState';

/**
 * Beta worlds (`"beta": true` in worlds.json) are accepted by the server and detected
 * by Alt1 like any other world, but the grid keeps them out of sight unless they carry
 * intel or the search box holds their exact number. Nothing else (favorites, the
 * hidden filter, "needs intel") can surface one, and a beta world disappears again
 * once its intel lapses back to `none`.
 *
 * Pass `search = ''` to get the set that counts toward the scouted counter, so typing
 * a beta world's number doesn't change the denominator.
 */
export function gateBetaWorlds(worlds: WorldConfig[], worldStates: WorldStates, search: string): WorldConfig[] {
  const s = search.trim();
  return worlds.filter(w =>
    !w.beta
    || isActive(worldStates[w.id] ?? NONE_STATE)
    || String(w.id) === s,
  );
}
