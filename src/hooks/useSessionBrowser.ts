import { useState, useCallback, useMemo } from 'react';
import type { SessionSummary } from '../../shared/protocol.ts';

export type BrowseSortMode = 'newest' | 'active' | 'members';

export function useSessionBrowser() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<BrowseSortMode>('active');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error('Failed to load sessions');
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  const sorted = useMemo(() => {
    const list = [...sessions];
    switch (sortMode) {
      case 'newest':  list.sort((a, b) => b.createdAt - a.createdAt); break;
      case 'active':  list.sort((a, b) => b.lastActivityAt - a.lastActivityAt); break;
      case 'members': list.sort((a, b) => b.clientCount - a.clientCount); break;
    }
    return list;
  }, [sessions, sortMode]);

  return { sessions: sorted, loading, error, sortMode, setSortMode, fetchSessions } as const;
}
