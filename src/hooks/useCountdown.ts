import { useState, useEffect } from 'react';

/**
 * Returns the number of whole seconds remaining until `targetTime` (ms timestamp),
 * or `null` when the target is null or has already passed.
 * Re-ticks every `interval` ms (default 500ms).
 */
export function useCountdown(targetTime: number | null, interval = 500): number | null {
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!targetTime) {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const secs = Math.ceil((targetTime - Date.now()) / 1000);
      setCountdown(secs > 0 ? secs : null);
    };
    tick();
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [targetTime, interval]);

  return countdown;
}
