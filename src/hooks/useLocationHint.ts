import { useState } from 'react';
import { locationsForHint, resolveExactLocation, hintForLocation } from '../constants/evilTree';

/**
 * Manages hint + exact location state with bidirectional sync:
 * - Changing the hint auto-resolves an exact location when only one exists,
 *   and clears any incompatible existing selection.
 * - Changing the exact location back-fills the hint when none is set.
 */
export function useLocationHint(initialHint = '', initialExact = '') {
  const [hint, setHint] = useState(initialHint);
  const [exactLocation, setExactLocation] = useState(initialExact);

  function handleHintChange(newHint: string) {
    setHint(newHint);
    if (exactLocation && !locationsForHint(newHint).includes(exactLocation)) {
      setExactLocation('');
    } else {
      setExactLocation(resolveExactLocation(newHint));
    }
  }

  function handleExactLocationChange(loc: string) {
    setExactLocation(loc);
    if (loc && !hint) {
      const derived = hintForLocation(loc);
      if (derived) setHint(derived);
    }
  }

  return { hint, exactLocation, handleHintChange, handleExactLocationChange };
}
