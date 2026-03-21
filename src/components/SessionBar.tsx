import { useState } from 'react';
import { Link2, Copy, Check } from 'lucide-react';
import type { SessionState } from '../hooks/useSession';
import { extractSessionCode, buildSessionUrl, buildInviteUrl, validateSessionCode } from '../lib/sessionUrl';
import { useCountdown } from '../hooks/useCountdown';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { MAX_RECONNECT_ATTEMPTS } from '../hooks/useSession';
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

export function SessionBar({ session, activeLocalCount, onCreateSession, onJoinSession, onRequestSessionJoin, onRejoinSession, onDismissError, onOpenSession, onRequestPersonalToken }: SessionBarProps) {
  const [joinCode, setJoinCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const { copied, copy: copyCode } = useCopyFeedback();
  const { copied: tokenCopied, copy: copyToken } = useCopyFeedback();
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
    if (session.status !== 'connecting' || session.reconnectAttempt === 0) return null;
    const remaining = MAX_RECONNECT_ATTEMPTS - session.reconnectAttempt;
    const suffix = remaining === 0 ? 'Last try' : `${remaining} ${remaining === 1 ? 'try' : 'tries'} left`;
    if (countdown && countdown > 0) return `Connection lost. Retrying in ${countdown}s · ${suffix}`;
    return `Connection lost. Attempting to reconnect… · ${suffix}`;
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

        {/* Code — clickable to copy in anon mode, plain in managed mode */}
        {session.managed ? (
          <span className={`font-mono font-bold ${STATUS_TEXT_COLORS[session.status]}`}>
            {session.code}
          </span>
        ) : (
          <button
            onClick={handleCopyCode}
            className={`font-mono font-bold ${STATUS_TEXT_COLORS[session.status]} hover:opacity-80 transition-opacity`}
            title="Copy session link"
          >
            {session.code}
          </button>
        )}

        {/* Copy icon — anon mode only */}
        {!session.managed && (
          <button
            onClick={handleCopyCode}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Copy session link"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          </button>
        )}

        {/* Alt1 Scout link — only when connected */}
        {isConnected && !canRejoin && (
          <>
            {session.personalToken ? (
              <span className="flex items-center gap-1.5">
                <Link2 className={`w-3 h-3 ${session.scoutWorld !== null ? CONNECTION_COLOR.connectedText : 'text-gray-500'}`} />
                <span className="text-gray-400 text-xs">Alt1 code:</span>
                <button
                  onClick={() => copyToken(buildInviteUrl(session.personalToken!))}
                  className="font-mono font-bold text-amber-300 tracking-widest transition-colors hover:text-amber-200"
                  title="Copy Alt1 link"
                >
                  {session.personalToken}
                </button>
                {tokenCopied && <span className="text-green-400 text-xs">Copied!</span>}
              </span>
            ) : (
              <button
                onClick={session.managed ? undefined : onRequestPersonalToken}
                className="text-xs px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                title="Get a code to link your Ectotrees Scout Alt1 plugin"
              >
                Get Alt1 Code
              </button>
            )}
          </>
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

      {session.error && (
        <DismissableError message={session.error} onDismiss={onDismissError} />
      )}
    </div>
  );
}
