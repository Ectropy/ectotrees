import { useState, useEffect } from 'react';
import type { SessionState } from '../hooks/useSession';
import { MAX_RECONNECT_ATTEMPTS } from '../hooks/useSession';

interface SessionBarProps {
  session: SessionState;
  activeLocalCount: number;
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code: string, contribute?: boolean) => Promise<boolean>;
  onRejoinSession: (code: string) => Promise<boolean>;
  onLeaveSession: () => void;
  onDismissError: () => void;
}

const STATUS_COLORS: Record<SessionState['status'], string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-red-500',
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

export function SessionBar({ session, activeLocalCount, onCreateSession, onJoinSession, onRejoinSession, onLeaveSession, onDismissError }: SessionBarProps) {
  const [joinCode, setJoinCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

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

  async function handleCreate() {
    setLoading(true);
    await onCreateSession();
    setLoading(false);
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) return;
    if (activeLocalCount > 0) {
      setPendingJoinCode(code);
      return;
    }
    setLoading(true);
    const ok = await onJoinSession(code);
    setLoading(false);
    if (ok) {
      setJoinCode('');
      setShowJoinInput(false);
    }
  }

  async function handleJoinWithStrategy(contribute: boolean) {
    if (!pendingJoinCode) return;
    setLoading(true);
    const ok = await onJoinSession(pendingJoinCode, contribute);
    setLoading(false);
    if (ok) {
      setJoinCode('');
      setShowJoinInput(false);
      setPendingJoinCode(null);
    }
  }

  async function handleCopyCode() {
    if (!session.code) return;
    try {
      await navigator.clipboard.writeText(session.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  function getReconnectText(): string | null {
    if (session.status !== 'connecting' || session.reconnectAttempt === 0) return null;
    const remaining = MAX_RECONNECT_ATTEMPTS - session.reconnectAttempt;
    const suffix = remaining === 0 ? 'Last try' : `${remaining} ${remaining === 1 ? 'try' : 'tries'} left`;
    if (countdown && countdown > 0) return `Connection lost. Retrying in ${countdown}s · ${suffix}`;
    return `Connection lost. Attempting to reconnect… · ${suffix}`;
  }

  // Give-up state: disconnected but still has a code (can rejoin)
  const canRejoin = session.status === 'disconnected' && session.code !== null;

  // Connected / connecting / can-rejoin state
  if (session.code) {
    const reconnectText = getReconnectText();

    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded text-xs flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[session.status]}`} />

        {reconnectText && (
          <span className="text-yellow-400 text-[10px] flex-shrink-0">{reconnectText}</span>
        )}

        {canRejoin && (
          <span className="text-red-500 text-[10px] flex-shrink-0">
            Disconnected.
          </span>
        )}

        <span className="text-gray-400">Session:</span>
        <button
          onClick={handleCopyCode}
          className="font-mono font-bold text-amber-400 hover:text-amber-300 transition-colors"
          title="Copy session code"
        >
          {session.code}
        </button>
        {copied && <span className="text-green-400 text-[10px]">Copied!</span>}

        {!canRejoin && (
          <span className="text-gray-500">
            {session.clientCount} {session.clientCount === 1 ? 'scout' : 'scouts'}
          </span>
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
        
        {(
          <button
            onClick={onLeaveSession}
            className="ml-auto text-red-400 hover:text-red-300 transition-colors"
          >
            Leave
          </button>
        )}
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

      {pendingJoinCode ? (
        <div className="flex flex-col gap-1">
          <span className="text-gray-300 text-[10px]">
            You have local data for {activeLocalCount} world{activeLocalCount !== 1 ? 's' : ''}. Join session how?
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => handleJoinWithStrategy(true)}
              disabled={loading}
              className="px-2 py-0.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded transition-colors"
              title="Add your scouted worlds to the session"
            >
              {loading ? '...' : 'Contribute my intel'}
            </button>
            <button
              onClick={() => handleJoinWithStrategy(false)}
              disabled={loading}
              className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
            >
              {loading ? '...' : 'Discard my intel'}
            </button>
            <button
              type="button"
              onClick={() => setPendingJoinCode(null)}
              className="text-gray-400 hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : showJoinInput ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); handleJoin(); }}
        >
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={6}
            className="w-20 px-1.5 py-0.5 bg-gray-700 text-white rounded font-mono text-center uppercase placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || joinCode.trim().length !== 6}
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
