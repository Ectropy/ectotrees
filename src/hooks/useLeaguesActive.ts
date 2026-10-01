import { useEffect, useState } from 'react';
import { isLeaguesActive, msUntilNextLeaguesBoundary } from '../../shared/worlds.ts';

// setTimeout overflows above 2^31-1 ms (~24.8 days) and fires immediately, so long
// waits (e.g. next year's Leagues) are split into capped hops that re-check on wake.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Whether the Leagues window in worlds.json is currently open. Re-renders exactly
 * when the window opens or closes, without polling, so a tab left open across the
 * boundary picks up the change.
 */
export function useLeaguesActive(): boolean {
  const [active, setActive] = useState(() => isLeaguesActive());
  // Bumped on every wake so a capped hop that doesn't flip `active` still re-arms.
  const [wake, setWake] = useState(0);

  useEffect(() => {
    const ms = msUntilNextLeaguesBoundary();
    if (ms === null) return;
    // +1 so we wake strictly past the boundary (`end` is exclusive).
    const id = setTimeout(() => {
      setActive(isLeaguesActive());
      setWake(n => n + 1);
    }, Math.min(ms + 1, MAX_TIMEOUT_MS));
    return () => clearTimeout(id);
  }, [wake]);

  return active;
}
