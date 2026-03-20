import { useState, useCallback } from 'react';

const STORAGE_KEY = 'evilTree_hiddenWorlds';

function loadHidden(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch { /* ignore corrupt data */ }
  return new Set();
}

function saveHidden(hidden: Set<number>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
}

export function useHiddenWorlds() {
  const [hiddenWorlds, setHiddenWorlds] = useState<Set<number>>(loadHidden);

  const toggleHidden = useCallback((worldId: number) => {
    setHiddenWorlds(prev => {
      const next = new Set(prev);
      if (next.has(worldId)) next.delete(worldId);
      else next.add(worldId);
      saveHidden(next);
      return next;
    });
  }, []);

  return { hiddenWorlds, toggleHidden } as const;
}
