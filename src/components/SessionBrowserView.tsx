import { useState, useEffect, useRef } from 'react';
import { RefreshCw, TreeDeciduous } from 'lucide-react';
import { MemberCount } from './MemberCount';
import type { SessionState } from '../hooks/useSession';
import { useSessionBrowser } from '../hooks/useSessionBrowser';
import { extractSessionCode, validateSessionCode } from '../lib/sessionUrl';
import { TEXT_COLOR, TREE_COLOR, MANAGED_COLOR, BUTTON_SECONDARY, ERROR_COLOR } from '../constants/toolColors';

const RUNESCAPE_USERNAME_INPUT_PROPS = {
  type: 'text' as const,
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  inputMode: 'text' as const,
};

interface SessionBrowserViewProps {
  session: SessionState;
  activeLocalCount: number;
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code: string) => boolean;
  onRequestSessionJoin: (code: string) => Promise<boolean>;
  onOpenJoin: (code: string, name: string) => Promise<boolean>;
  onDismissError: () => void;
  showOnStartup: boolean;
  onShowOnStartupChange: (value: boolean) => void;
  onSessionStarted: () => void;
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
  onOpenJoin,
  onDismissError,
  showOnStartup,
  onShowOnStartupChange,
  onSessionStarted,
}: SessionBrowserViewProps) {
  const { sessions, loading: browsing, error: browseError, fetchSessions } = useSessionBrowser();
  const [joinCode, setJoinCode] = useState('');
  const [badPaste, setBadPaste] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const autoTriggeredRef = useRef<string | null>(null);
  // Open-join inline form state
  const [openJoinCode, setOpenJoinCode] = useState<string | null>(null);
  const [openJoinName, setOpenJoinName] = useState('');
  const [openJoining, setOpenJoining] = useState(false);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 15_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  async function handleCreate() {
    setCreating(true);
    const code = await onCreateSession();
    setCreating(false);
    if (code) onSessionStarted();
  }

  async function handleJoin() {
    const codeOrToken = joinCode.trim().toUpperCase();
    const isToken = codeOrToken.length === 12;
    const isCode = validateSessionCode(codeOrToken);
    if (!isCode && !isToken) return;

    setJoining(true);
    const joined = await onRequestSessionJoin(codeOrToken);
    setJoining(false);
    // Only clear input on success — on failure, preserve it so user can
    // continue typing (e.g. chars 7–12 of an invite token after a 6-char mismatch)
    if (joined) {
      setJoinCode('');
    } else {
      // Reset so the same value can be retried after an error
      autoTriggeredRef.current = null;
    }
  }

  // Auto-trigger join preview/flow when a valid code/token is entered
  // (like how 2FA apps auto-submit when all digits are entered)
  useEffect(() => {
    const codeOrToken = joinCode.trim().toUpperCase();
    const isCode = validateSessionCode(codeOrToken);
    const isToken = codeOrToken.length === 12;
    if ((isCode || isToken) && autoTriggeredRef.current !== codeOrToken) {
      autoTriggeredRef.current = codeOrToken;
      // Debounce slightly to ensure state is settled
      const timer = setTimeout(() => {
        handleJoin();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [joinCode]);

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
          <p className={`text-sm ${TEXT_COLOR.muted} mb-4`}>
            Create or join a session to share intel with others.
          </p>

          {/* Create / Join */}
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCreate}
                disabled={busy}
                className={`px-2 py-0.5 border ${TREE_COLOR.border} ${TREE_COLOR.label} ${TREE_COLOR.borderHover} disabled:opacity-50 text-white text-xs rounded transition-colors whitespace-nowrap`}
              >
                {creating ? 'Creating…' : 'Create Session'}
              </button>
              <span className={`text-xs ${TEXT_COLOR.faint}`}>or</span>
              <div className="flex items-center flex-1 min-w-0">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => {
                    onDismissError();
                    const x = extractSessionCode(e.target.value);
                    // Accept codes (6 chars) or tokens (12 chars)
                    if (x.length > 12) {
                      setJoinCode(x.slice(0, 12));
                      setBadPaste(true);
                      setTimeout(() => setBadPaste(false), 2500);
                    } else {
                      setJoinCode(x);
                      setBadPaste(false);
                    }
                  }}
                  placeholder="Join code or link"
                  className="flex-1 min-w-0 px-2 py-0.5 bg-gray-700 border border-gray-600 text-white rounded font-mono text-center text-xs uppercase placeholder:text-gray-500 placeholder:font-sans placeholder:normal-case focus:outline-none focus:ring-1 focus:ring-yellow-500"
                />
              </div>
            </div>
            {badPaste && <p className={`text-xs ${ERROR_COLOR.text} mt-1`}>Not a valid code or link</p>}
            {session.error && (
              <button
                onClick={onDismissError}
                className={`mt-1 ${ERROR_COLOR.text} text-xs ${ERROR_COLOR.textHover} transition-colors`}
                title={`${session.error} (click to dismiss)`}
              >
                {session.error === 'Session not found.' && joinCode.length > 0
                  ? 'Session not found. Keep typing to enter a 12-digit invite token.'
                  : session.error}
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
                <p className={`text-sm ${ERROR_COLOR.text}`}>{browseError}</p>
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
              <div key={s.code} className="bg-gray-800 border border-gray-700 rounded p-3 space-y-2">
                <div className="flex gap-3">
                  {/* Left column: session info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white mb-1">{s.name}</p>
                    {/* Open-join inline form */}
                    {s.allowOpenJoin && openJoinCode === s.code && (
                      <form
                        autoComplete="off"
                        className="flex gap-2 mb-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const name = openJoinName.trim();
                          if (!name) return;
                          setOpenJoining(true);
                          const ok = await onOpenJoin(s.code, name);
                          setOpenJoining(false);
                          if (ok) {
                            setOpenJoinCode(null);
                            setOpenJoinName('');
                            onSessionStarted();
                          }
                        }}
                      >
                        <input
                          {...RUNESCAPE_USERNAME_INPUT_PROPS}
                          name="public-session-alias"
                          autoFocus
                          value={openJoinName}
                          onChange={e => setOpenJoinName(e.target.value)}
                          placeholder="Your username"
                          maxLength={32}
                          className="flex-1 min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                        />
                        <button
                          type="submit"
                          disabled={!openJoinName.trim() || openJoining}
                          className={`px-3 py-1 ${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} disabled:opacity-50 text-xs font-medium rounded transition-colors`}
                        >
                          {openJoining ? '…' : 'Join →'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setOpenJoinCode(null); setOpenJoinName(''); }}
                          className={`px-2 py-1 ${BUTTON_SECONDARY} text-xs`}
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                    <div className="flex items-center gap-3 text-xs">
                      <span className={`flex items-center gap-1 ${TEXT_COLOR.muted}`}>
                        <TreeDeciduous className="w-3 h-3" /> {s.activeWorldCount}
                      </span>
                      <MemberCount clientCount={s.dashboards} scouts={s.scouts} connected={true} className="text-xs" />
                    </div>
                    <p className={`text-xs ${TEXT_COLOR.faint} mt-1`}>Active {relativeTime(s.lastActivityAt)}</p>
                  </div>
                  {/* Right column: action buttons */}
                  {openJoinCode !== s.code && (
                    <div className="min-w-max flex flex-col gap-1 justify-start">
                      {s.allowOpenJoin && (
                        <button
                          onClick={() => { setOpenJoinCode(s.code); setOpenJoinName(''); }}
                          className={`w-full px-3 py-1 ${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} text-xs font-medium rounded transition-colors`}
                        >
                          Join as Scout
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (activeLocalCount > 0) {
                            await onRequestSessionJoin(s.code);
                          } else {
                            if (onJoinSession(s.code)) onSessionStarted();
                          }
                        }}
                        className={`w-full px-3 py-1 ${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} text-xs font-medium rounded transition-colors`}
                      >
                        Join as Viewer
                      </button>
                    </div>
                  )}
                </div>
                {s.description && (
                  <p className={`text-xs ${TEXT_COLOR.muted}`}>{s.description}</p>
                )}
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
            <span className={`text-sm ${TEXT_COLOR.muted}`}>Don't show Sessions on startup</span>
          </label>
        </div>
      </div>
    </div>
  );
}
