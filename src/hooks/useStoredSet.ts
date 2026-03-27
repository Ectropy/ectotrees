import { useState, useCallback } from 'react';

export function useStoredSet(storageKey: string) {
  const [set, setSet] = useState<Set<number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as number[]);
    } catch { /* ignore corrupt data */ }
    return new Set();
  });

  const toggle = useCallback((id: number) => {
    setSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }, [storageKey]);

  return { set, toggle } as const;
}
