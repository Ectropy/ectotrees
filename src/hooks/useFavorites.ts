import { useStoredSet } from './useStoredSet';

export function useFavorites() {
  const { set: favorites, toggle: toggleFavorite } = useStoredSet('evilTree_favorites');
  return { favorites, toggleFavorite } as const;
}
