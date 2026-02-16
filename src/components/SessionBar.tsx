import { useState } from 'react';
import type { SessionState } from '../hooks/useSession';

interface SessionBarProps {
  session: SessionState;
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code: string) => Promise<boolean>;
  onLeaveSession: () => void;
}

const STATUS_COLORS: Record<SessionState['status'], string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-gray-500',
};

export function SessionBar({ session, onCreateSession, onJoinSession, onLeaveSession }: SessionBarProps) {
  const [joinCode, setJoinCode] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    await onCreateSession();
    setLoading(false);
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) return;
    setLoading(true);
    const ok = await onJoinSession(code);
    setLoading(false);
    if (ok) {
      setJoinCode('');
      setShowJoinInput(false);
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

  // Connected / connecting state
  if (session.code) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded text-xs flex-shrink-0">
        <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[session.status]}`} />
        <span className="text-gray-400">Session:</span>
        <button
          onClick={handleCopyCode}
          className="font-mono font-bold text-amber-400 hover:text-amber-300 transition-colors"
          title="Copy session code"
        >
          {session.code}
        </button>
        {copied && <span className="text-green-400 text-[10px]">Copied!</span>}
        <span className="text-gray-500">
          {session.clientCount} {session.clientCount === 1 ? 'user' : 'users'}
        </span>
        <button
          onClick={onLeaveSession}
          className="ml-auto text-red-400 hover:text-red-300 transition-colors"
        >
          Leave
        </button>
        {session.error && (
          <span className="text-red-400 text-[10px] truncate max-w-[200px]" title={session.error}>
            {session.error}
          </span>
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

      {showJoinInput ? (
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
        <span className="text-red-400 text-[10px] truncate max-w-[200px]" title={session.error}>
          {session.error}
        </span>
      )}
    </div>
  );
}
