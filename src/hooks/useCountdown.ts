import { useNow } from '@shared-browser/useNow';

/**
 * Returns the number of whole seconds remaining until `targetTime` (ms timestamp),
 * or `null` when the target is null or has already passed.
 * Re-ticks every `interval` ms (default 500ms).
 *
 * Pure derivation from `useNow` — no internal state or effects.
 */
export function useCountdown(targetTime: number | null, interval = 500): number | null {
  const now = useNow(interval);
  if (!targetTime) return null;
  const secs = Math.ceil((targetTime - now) / 1000);
  return secs > 0 ? secs : null;
}
