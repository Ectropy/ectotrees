import { useState, useCallback } from 'react';

const STORAGE_KEY = 'evilTree_favorites';

function loadFavorites(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch { /* ignore corrupt data */ }
  return new Set();
}

function saveFavorites(favorites: Set<number>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<number>>(loadFavorites);

  const toggleFavorite = useCallback((worldId: number) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(worldId)) next.delete(worldId);
      else next.add(worldId);
      saveFavorites(next);
      return next;
    });
  }, []);

  return { favorites, toggleFavorite } as const;
}
