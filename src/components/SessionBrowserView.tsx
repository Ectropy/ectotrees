import { useState, useEffect } from 'react';
import { Users, RefreshCw, TreeDeciduous, Shield } from 'lucide-react';
import type { SessionState } from '../hooks/useSession';
import { useSessionBrowser } from '../hooks/useSessionBrowser';
import { extractSessionCode, validateSessionCode } from '../lib/sessionUrl';
import { TEXT_COLOR } from '../constants/toolColors';

interface SessionBrowserViewProps {
  session: SessionState;
  activeLocalCount: number;
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code: string) => boolean;
  onRequestSessionJoin: (code: string) => Promise<void>;
  onDismissError: () => void;
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
  session,
  activeLocalCount,
  onCreateSession,
  onJoinSession,
  onRequestSessionJoin,
  onDismissError,
  showOnStartup,
  onShowOnStartupChange,
  onBack,
}: SessionBrowserViewProps) {
  const { sessions, loading: browsing, error: browseError, fetchSessions } = useSessionBrowser();
  const [joinCode, setJoinCode] = useState('');
  const [badPaste, setBadPaste] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 15_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  async function handleCreate() {
    setCreating(true);
    const code = await onCreateSession();
    setCreating(false);
    if (code) onBack();
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!validateSessionCode(code)) return;
    if (activeLocalCount > 0) {
      setJoinCode('');
      setJoining(true);
      await onRequestSessionJoin(code);
      setJoining(false);
      return;
    }
    setJoining(true);
    const ok = onJoinSession(code);
    setJoining(false);
    if (ok) {
      setJoinCode('');
      onBack();
    }
  }

  const busy = creating || joining;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-lg mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h1 className={`text-2xl font-bold ${TEXT_COLOR.prominent} flex items-center gap-2`}>
              <Users className="h-5 w-5" /> Sessions
            </h1>
            <button
              onClick={fetchSessions}
              disabled={browsing}
              className={`p-1.5 rounded transition-colors ${TEXT_COLOR.muted} hover:text-gray-200 hover:bg-gray-700 disabled:opacity-50`}
              title="Refresh sessions"
            >
              <RefreshCw className={`h-4 w-4 ${browsing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-sm ${TEXT_COLOR.muted} mb-4">
            Create or join a session to share intel with others.
          </p>

          {/* Create / Join */}
          <div className="bg-gray-800 border border-gray-700 rounded p-3 mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleCreate}
                disabled={busy}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors whitespace-nowrap"
              >
                {creating ? 'Creating…' : 'Create Session'}
              </button>
              <span className={`text-xs ${TEXT_COLOR.faint}`}>or</span>
              <form
                className="flex items-center gap-2 flex-1 min-w-0"
                onSubmit={(e) => { e.preventDefault(); handleJoin(); }}
              >
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => {
                    const x = extractSessionCode(e.target.value);
                    if (x.length > 6) {
                      setJoinCode('');
                      setBadPaste(true);
                      setTimeout(() => setBadPaste(false), 2500);
                    } else {
                      setJoinCode(x);
                      setBadPaste(false);
                    }
                  }}
                  placeholder="Code or link"
                  className="flex-1 min-w-0 px-2 py-2 bg-gray-700 border border-gray-600 text-white rounded font-mono text-center text-sm uppercase placeholder:text-gray-500 placeholder:font-sans placeholder:normal-case focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={busy || !validateSessionCode(joinCode.trim())}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
                >
                  {joining ? '…' : 'Join'}
                </button>
              </form>
            </div>
            {badPaste && <p className="text-xs text-red-400 mt-2">Not a valid code or link</p>}
            {session.error && (
              <button
                onClick={onDismissError}
                className="mt-2 text-red-400 text-xs hover:text-red-300 transition-colors"
                title={`${session.error} (click to dismiss)`}
              >
                {session.error}
              </button>
            )}
          </div>

          {/* Session list */}
          <div className="space-y-2">
            {browsing && sessions.length === 0 && (
              <p className={`text-sm ${TEXT_COLOR.muted} text-center py-8`}>Loading sessions...</p>
            )}

            {browseError && (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-red-400">{browseError}</p>
                <button
                  onClick={fetchSessions}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {!browsing && !browseError && sessions.length === 0 && (
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
                    onClick={() => { if (onJoinSession(s.code)) onBack(); }}
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
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-700 bg-gray-900 px-4 sm:px-6 py-3">
        <div className="max-w-lg mx-auto">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!showOnStartup}
              onChange={e => onShowOnStartupChange(!e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
            />
            <span className={`text-sm ${TEXT_COLOR.muted}`}>Don't show on startup</span>
          </label>
        </div>
      </div>
    </div>
  );
}
