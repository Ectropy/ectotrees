import { useState, useEffect } from 'react';

/**
 * Returns the current timestamp (ms) as reactive state, updating every `interval` ms.
 * Time enters the React tree as explicit state rather than a render-time side effect,
 * keeping component render functions pure.
 */
export function useNow(interval = 500): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
