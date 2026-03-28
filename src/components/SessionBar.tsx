import { useState } from 'react';
import { Link2, Copy, Check } from 'lucide-react';
import type { SessionState } from '../hooks/useSession';
import { extractSessionCode, buildSessionUrl, buildInviteUrl, validateSessionCode } from '../lib/sessionUrl';
import { useCountdown } from '../hooks/useCountdown';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { formatReconnectMessage } from '../../shared/reconnect.ts';
import { CONNECTION_COLOR, STATUS_DOT_COLORS, STATUS_TEXT_COLORS } from '../constants/toolColors';

interface SessionBarProps {
  session: SessionState;
  activeLocalCount: number;
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code: string) => boolean;
  onRequestSessionJoin: (code: string) => Promise<void>;
  onRejoinSession: (code: string) => void;
  onDismissError: () => void;
  onOpenSession: () => void;
  onRequestPersonalToken: () => void;
  onLinkWithAlt1: () => Promise<string | null>;
  onOpenBrowser: () => void;
}


function DismissableError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <button
      onClick={onDismiss}
      className="text-red-400 text-xs hover:text-red-300 transition-colors"
      title={`${message} (click to dismiss)`}
    >
      {message}
    </button>
  );
}

export function SessionBar({ session, activeLocalCount, onCreateSession, onJoinSession, onRequestSessionJoin, onRejoinSession, onDismissError, onOpenSession, onRequestPersonalToken, onLinkWithAlt1, onOpenBrowser }: SessionBarProps) {
  const [joinCode, setJoinCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const { copied, copy: copyCode } = useCopyFeedback(1500);
  const { copied: tokenCopied, copy: copyToken } = useCopyFeedback(1500);
  const countdown = useCountdown(session.reconnectAt ?? null);
  const [badPaste, setBadPaste] = useState(false);

  async function handleCreate() {
    setLoading(true);
    await onCreateSession();
    setLoading(false);
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!validateSessionCode(code)) return;
    if (activeLocalCount > 0) {
      setJoinCode('');
      setShowJoinInput(false);
      setLoading(true);
      await onRequestSessionJoin(code);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ok = onJoinSession(code);
    setLoading(false);
    if (ok) {
      setJoinCode('');
      setShowJoinInput(false);
    }
  }

  async function handleCopyCode() {
    if (!session.code) return;
    await copyCode(buildSessionUrl(session.code));
  }

  function getReconnectText(): string | null {
    if (session.status !== 'connecting') return null;
    return formatReconnectMessage(session.reconnectAttempt, countdown);
  }

  const canRejoin = session.status === 'disconnected' && session.code !== null;

  if (session.code) {
    const reconnectText = getReconnectText();
    const isConnected = session.status === 'connected';

    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded text-xs flex-shrink-0 flex-wrap">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[session.status]}`} />

        {reconnectText && (
          <span className={`${STATUS_TEXT_COLORS[session.status]} text-xs flex-shrink-0`}>{reconnectText}</span>
        )}

        {canRejoin && (
          <span className={`${STATUS_TEXT_COLORS[session.status]} text-xs flex-shrink-0`}>
            Disconnected.
          </span>
        )}

        <span className={`${STATUS_TEXT_COLORS[session.status]} opacity-60`}>Session:</span>

        {/* Code — clickable to copy + open session panel */}
        {session.managed ? (
          <button
            onClick={onOpenSession}
            className={`font-mono font-bold ${STATUS_TEXT_COLORS[session.status]} hover:opacity-80 transition-opacity`}
            title="Open session panel"
          >
            {session.code}
          </button>
        ) : (
          <button
            onClick={() => { handleCopyCode(); onOpenSession(); }}
            className={`font-mono font-bold ${STATUS_TEXT_COLORS[session.status]} hover:opacity-80 transition-opacity`}
            title="Copy session link & open session panel"
          >
            {session.code}
          </button>
        )}

        {/* Copy icon — anon mode only */}
        {!session.managed && (
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
            title="Copy session link"
          >
            {copied
              ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
              : <><Copy className="w-3 h-3" /><span>Copy</span></>
            }
          </button>
        )}

        {/* Alt1 Scout link — token display when connected and have token */}
        {isConnected && !canRejoin && session.personalToken && (
          <span className="flex items-center gap-1.5">
            <Link2 className={`w-3 h-3 ${session.scoutWorld !== null ? CONNECTION_COLOR.connectedText : 'text-gray-500'}`} />
            <span className="text-gray-400 text-xs">Alt1 code:</span>
            <button
              onClick={() => { copyToken(buildInviteUrl(session.personalToken!)); onOpenSession(); }}
              className="font-mono font-bold text-amber-300 tracking-widest hover:opacity-80 transition-opacity"
              title="Copy Alt1 link & open session panel"
            >
              {session.personalToken}
            </button>
            <button
              onClick={() => copyToken(buildInviteUrl(session.personalToken!))}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
              title="Copy Alt1 link"
            >
              {tokenCopied
                ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                : <><Copy className="w-3 h-3" /><span>Copy</span></>
              }
            </button>
          </span>
        )}

        {/* Link with Alt1 button — when no personal token and not in managed mode */}
        {!session.personalToken && !session.managed && (
          <button
            onClick={isConnected ? onRequestPersonalToken : onLinkWithAlt1}
            className="text-xs px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            title="Get a code to link your Ectotrees Scout Alt1 plugin"
          >
            Link with Alt1
          </button>
        )}

        {canRejoin && (
          <button
            onClick={() => onRejoinSession(session.code!)}
            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            Rejoin?
          </button>
        )}

        {session.error && (
          <DismissableError message={session.error} onDismiss={onDismissError} />
        )}

        {/* Fork invite indicator */}
        {session.forkInvite && !session.managed && (
          <button
            onClick={onOpenSession}
            className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-900/40 border border-amber-700/50 hover:bg-amber-900/60 text-amber-300 text-xs rounded transition-colors flex-shrink-0"
            title={`${session.forkInvite.initiatorName} created a managed fork — click to view`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            Managed fork available
          </button>
        )}

        {/* Right side: member count + manage button */}
        <span className="ml-auto flex items-center gap-2">
          {!canRejoin && (
            <span className="text-gray-500">
              {session.clientCount} {session.clientCount === 1 ? 'member' : 'members'}
              {session.scouts > 0 && ` · ${session.scouts} ${session.scouts === 1 ? 'scout' : 'scouts'}`}
            </span>
          )}
          <button
            onClick={onOpenSession}
            className="text-xs px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
          >
            Manage session
          </button>
        </span>

      </div>
    );
  }

  // Disconnected state
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded text-xs flex-shrink-0">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded transition-colors"
      >
        {loading ? '...' : 'Create Session'}
      </button>

      {showJoinInput ? (
        <>
        <form
          className="flex items-center gap-1"
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
            placeholder="CODE"
            className="w-20 px-1.5 py-0.5 bg-gray-700 text-white rounded font-mono text-center uppercase placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !/^[A-HJ-NP-Z2-9]{6}$/.test(joinCode.trim())}
            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
          >
            {loading ? '...' : 'Join'}
          </button>
          <button
            type="button"
            onClick={() => { setShowJoinInput(false); setJoinCode(''); }}
            className="text-gray-400 hover:text-gray-300"
          >
            Cancel
          </button>
        </form>
        {badPaste && <span className="text-xs text-red-400">Not a valid code or link</span>}
        </>
      ) : (
        <button
          onClick={() => setShowJoinInput(true)}
          className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
        >
          Join Session
        </button>
      )}

      <button
        onClick={onOpenBrowser}
        className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
      >
        Browse
      </button>

      <button
        onClick={onLinkWithAlt1}
        className="text-xs px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
        title="Create a session and get a code to link your Ectotrees Scout Alt1 plugin"
      >
        Link with Alt1
      </button>

      {session.error && (
        <DismissableError message={session.error} onDismiss={onDismissError} />
      )}
    </div>
  );
}
