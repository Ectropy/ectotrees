import { useStoredSet } from './useStoredSet';

export function useHiddenWorlds() {
  const { set: hiddenWorlds, toggle: toggleHidden } = useStoredSet('evilTree_hiddenWorlds');
  return { hiddenWorlds, toggleHidden } as const;
}
