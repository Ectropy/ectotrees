import { useSyncExternalStore } from 'react';

/**
 * App-wide shared clock: one 500ms interval no matter how many subscribers.
 * Components read it via `useSharedNow()` so only the leaves that actually
 * display time re-render on each tick.
 */

const TICK_MS = 500;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot(): number {
  return now;
}

/** Current timestamp (ms), updated every 500ms by a single shared interval. */
export function useSharedNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
