import { useEffect } from 'react';
import { Search, RefreshCw, Users, TreeDeciduous, Shield } from 'lucide-react';
import { useSessionBrowser } from '../hooks/useSessionBrowser';
import { TEXT_COLOR, BUTTON_SECONDARY } from '../constants/toolColors';

interface SessionBrowserViewProps {
  onJoinSession: (code: string) => boolean;
  onRequestSessionJoin: (code: string) => Promise<void>;
  showOnStartup: boolean;
  onShowOnStartupChange: (value: boolean) => void;
  onBack: () => void;
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SessionBrowserView({
  onJoinSession,
  showOnStartup,
  onShowOnStartupChange,
  onBack,
}: SessionBrowserViewProps) {
  const { sessions, loading, error, fetchSessions } = useSessionBrowser();

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 15_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.prominent} flex items-center gap-2`}>
            <Search className="h-5 w-5" /> Session Browser
          </h1>
          <button
            onClick={fetchSessions}
            disabled={loading}
            className={`p-1.5 rounded transition-colors ${TEXT_COLOR.muted} hover:text-gray-200 hover:bg-gray-700 disabled:opacity-50`}
            title="Refresh sessions"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Placeholder for future sort/filter controls */}
        <div className="min-h-[2rem]" />

        <div className="space-y-2">
          {loading && sessions.length === 0 && (
            <p className={`text-sm ${TEXT_COLOR.muted} text-center py-8`}>Loading sessions...</p>
          )}

          {error && (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchSessions}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className={`text-sm ${TEXT_COLOR.muted}`}>No public sessions available</p>
              <p className={`text-xs ${TEXT_COLOR.faint}`}>Create a session and list it in the browser to share with others</p>
            </div>
          )}

          {sessions.map(s => (
            <div key={s.code} className="bg-gray-800 border border-gray-700 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{s.name}</span>
                <button
                  onClick={() => onJoinSession(s.code)}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors"
                >
                  Join
                </button>
              </div>
              {s.description && (
                <p className={`text-xs ${TEXT_COLOR.muted} mb-1.5`}>{s.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs">
                <span className={`font-mono ${TEXT_COLOR.faint}`}>{s.code}</span>
                {s.managed ? (
                  <span className="flex items-center gap-1 text-blue-400">
                    <Shield className="w-3 h-3" /> Managed
                  </span>
                ) : (
                  <span className={TEXT_COLOR.faint}>Anonymous</span>
                )}
                <span className={`flex items-center gap-1 ${TEXT_COLOR.muted}`}>
                  <Users className="w-3 h-3" /> {s.clientCount}
                </span>
                <span className={`flex items-center gap-1 ${TEXT_COLOR.muted}`}>
                  <TreeDeciduous className="w-3 h-3" /> {s.activeWorldCount}
                </span>
              </div>
              <p className={`text-xs ${TEXT_COLOR.faint} mt-1`}>Active {relativeTime(s.lastActivityAt)}</p>
            </div>
          ))}
        </div>

        <label className="mt-6 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!showOnStartup}
            onChange={e => onShowOnStartupChange(!e.target.checked)}
            className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
          />
          <span className={`text-sm ${TEXT_COLOR.muted}`}>Don't show on startup</span>
        </label>

        <button
          onClick={onBack}
          className={`mt-6 w-full ${BUTTON_SECONDARY} py-2.5`}
        >
          Close
        </button>
      </div>
    </div>
  );
}
