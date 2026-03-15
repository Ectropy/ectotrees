import { useEffect, useRef } from 'react';

/**
 * Calls `onEscape` whenever the Escape key is pressed.
 * Uses a ref so callers don't need to stabilise the callback reference.
 */
export function useEscapeKey(onEscape: () => void) {
  const callbackRef = useRef(onEscape);
  callbackRef.current = onEscape;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') callbackRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
