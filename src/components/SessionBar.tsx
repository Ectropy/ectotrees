import { useState, useEffect } from 'react';
import type { SessionState } from '../hooks/useSession';
import { extractSessionCode, buildSessionUrl } from '../lib/sessionUrl';
import { MAX_RECONNECT_ATTEMPTS } from '../hooks/useSession';
import { CONNECTION_COLOR } from '../constants/toolColors';

interface SessionBarProps {
  session: SessionState;
  activeLocalCount: number;
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code: string) => boolean;
  onRequestSessionJoin: (code: string) => Promise<void>;
  onRejoinSession: (code: string) => void;
  onLeaveSession: () => void;
  onDismissError: () => void;
  onRequestPairToken: () => void;
  onUnpair: () => void;
}

const STATUS_DOT_COLORS: Record<SessionState['status'], string> = {
  connected:    CONNECTION_COLOR.connectedDot,
  connecting:   CONNECTION_COLOR.connectingDot,
  disconnected: CONNECTION_COLOR.disconnectedDot,
};

const STATUS_TEXT_COLORS: Record<SessionState['status'], string> = {
  connected:    CONNECTION_COLOR.connectedText,
  connecting:   CONNECTION_COLOR.connectingText,
  disconnected: CONNECTION_COLOR.disconnectedText,
};

function DismissableError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <button
      onClick={onDismiss}
      className="text-red-400 text-[10px] hover:text-red-300 transition-colors"
      title={`${message} (click to dismiss)`}
    >
      {message}
    </button>
  );
}

export function SessionBar({ session, activeLocalCount, onCreateSession, onJoinSession, onRequestSessionJoin, onRejoinSession, onLeaveSession, onDismissError, onRequestPairToken, onUnpair }: SessionBarProps) {
  const [joinCode, setJoinCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [tokenCountdown, setTokenCountdown] = useState<number | null>(null);
  const [badPaste, setBadPaste] = useState(false);

  // Reconnect countdown
  useEffect(() => {
    if (!session.reconnectAt) {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const secs = Math.ceil((session.reconnectAt! - Date.now()) / 1000);
      setCountdown(secs > 0 ? secs : null);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [session.reconnectAt]);

  // Pair token countdown
  useEffect(() => {
    if (!session.pairTokenExpiresAt) {
      setTokenCountdown(null);
      return;
    }
    const tick = () => {
      const secs = Math.ceil((session.pairTokenExpiresAt! - Date.now()) / 1000);
      setTokenCountdown(secs > 0 ? secs : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.pairTokenExpiresAt]);

  async function handleCreate() {
    setLoading(true);
    await onCreateSession();
    setLoading(false);
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return;
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

    const sessionUrl = buildSessionUrl(session.code);
    const secure = window.isSecureContext;
    if (!secure) {
      console.warn('[clipboard] Not a secure context — navigator.clipboard API is unavailable.');
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(sessionUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (err) {
        console.error('[clipboard] Clipboard API writeText failed:', err);
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = sessionUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('[clipboard] execCommand fallback failed:', err);
    }
  }

  async function handleCopyToken() {
    if (!session.pairToken) return;
    try {
      await navigator.clipboard.writeText(session.pairToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      // fallback: select and copy
    }
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
          <span className={`${STATUS_TEXT_COLORS[session.status]} text-[10px] flex-shrink-0`}>{reconnectText}</span>
        )}

        {canRejoin && (
          <span className={`${STATUS_TEXT_COLORS[session.status]} text-[10px] flex-shrink-0`}>
            Disconnected.
          </span>
        )}

        <span className={`${STATUS_TEXT_COLORS[session.status]} opacity-60`}>Session:</span>
        <button
          onClick={handleCopyCode}
          className={`font-mono font-bold ${STATUS_TEXT_COLORS[session.status]} transition-colors`}
          title="Copy session link"
        >
          {session.code}
        </button>
        {copied && <span className="text-green-400 text-[10px]">Link copied!</span>}

        {!canRejoin && (
          <span className="text-gray-500">
            {session.clientCount} {session.clientCount === 1 ? 'member' : 'members'}
            {session.scouts > 0 && ` · ${session.scouts} ${session.scouts === 1 ? 'scout' : 'scouts'}`}
          </span>
        )}

        {/* Pairing controls — only when connected */}
        {isConnected && !canRejoin && (
          <>
            {session.isPaired ? (
              <span className="flex items-center gap-1.5 text-amber-400 text-[10px]">
                <span>⚡ Paired</span>
                <button
                  onClick={onUnpair}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                  title="Unpair Scout"
                >
                  ×
                </button>
              </span>
            ) : session.pairToken ? (
              <span className="flex items-center gap-1.5">
                <span className="text-gray-400 text-[10px]">Pair code:</span>
                <span className="font-mono font-bold text-amber-300 tracking-widest">{session.pairToken}</span>
                <button
                  onClick={handleCopyToken}
                  className="text-gray-400 hover:text-gray-200 transition-colors text-[10px]"
                  title="Copy pair token"
                >
                  {tokenCopied ? '✓' : 'copy'}
                </button>
                {tokenCountdown !== null && (
                  <span className="text-gray-600 text-[10px]">{tokenCountdown}s</span>
                )}
              </span>
            ) : (
              <button
                onClick={onRequestPairToken}
                className="text-[10px] px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                title="Pair with Scout app"
              >
                Pair Scout
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

        <button
          onClick={onLeaveSession}
          className="ml-auto text-red-500 hover:text-red-400 transition-colors"
        >
          Leave
        </button>
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
