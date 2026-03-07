import { useState, useEffect } from 'react';
import { Link2, Shield, Users, Copy, Check } from 'lucide-react';
import type { SessionState } from '../hooks/useSession';
import { extractSessionCode, buildSessionUrl } from '../lib/sessionUrl';
import { copyToClipboard } from '../lib/utils';
import { MAX_RECONNECT_ATTEMPTS } from '../hooks/useSession';
import { CONNECTION_COLOR, TEXT_COLOR } from '../constants/toolColors';
import { MemberPanel } from './MemberPanel';

interface SessionViewProps {
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
  onEnableManaged: () => void;
  onCreateInvite: (name: string, role?: 'scout' | 'viewer') => void;
  onBanMember: (inviteToken: string) => void;
  onRenameMember: (inviteToken: string, name: string) => void;
  onSetMemberRole: (inviteToken: string, role: 'moderator' | 'scout' | 'viewer') => void;
  onTransferOwnership: (inviteToken: string) => void;
  onBack: () => void;
}

const STATUS_DOT_COLORS: Record<SessionState['status'], string> = {
  connected:    CONNECTION_COLOR.connectedDot,
  connecting:   CONNECTION_COLOR.connectingDot,
  disconnected: CONNECTION_COLOR.disconnectedDot,
};

const STATUS_LABELS: Record<SessionState['status'], string> = {
  connected:    'Connected',
  connecting:   'Connecting…',
  disconnected: 'Disconnected',
};

export function SessionView({
  session, activeLocalCount,
  onCreateSession, onJoinSession, onRequestSessionJoin, onRejoinSession, onLeaveSession,
  onDismissError, onRequestPairToken, onUnpair, onEnableManaged,
  onCreateInvite, onBanMember, onSetMemberRole, onBack,
}: SessionViewProps) {
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [tokenCountdown, setTokenCountdown] = useState<number | null>(null);
  const [badPaste, setBadPaste] = useState(false);

  // Reconnect countdown
  useEffect(() => {
    if (!session.reconnectAt) { setCountdown(null); return; }
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
    if (!session.pairTokenExpiresAt) { setTokenCountdown(null); return; }
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
      setLoading(true);
      await onRequestSessionJoin(code);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ok = onJoinSession(code);
    setLoading(false);
    if (ok) setJoinCode('');
  }

  async function handleCopyCode() {
    if (!session.code) return;
    const ok = await copyToClipboard(buildSessionUrl(session.code));
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  async function handleCopyToken() {
    if (!session.pairToken) return;
    const ok = await copyToClipboard(session.pairToken);
    if (ok) { setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000); }
  }

  function getReconnectText(): string | null {
    if (session.status !== 'connecting' || session.reconnectAttempt === 0) return null;
    const remaining = MAX_RECONNECT_ATTEMPTS - session.reconnectAttempt;
    const suffix = remaining === 0 ? 'Last try' : `${remaining} ${remaining === 1 ? 'try' : 'tries'} left`;
    if (countdown && countdown > 0) return `Retrying in ${countdown}s · ${suffix}`;
    return `Attempting to reconnect… · ${suffix}`;
  }

  const isConnected = session.status === 'connected';
  const canRejoin = session.status === 'disconnected' && session.code !== null;

  // ─── No active session ───
  if (!session.code) {
    return (
      <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
        <div className="max-w-lg mx-auto">
          <div className="mb-6">
            <h1 className={`text-2xl font-bold ${TEXT_COLOR.prominent} flex items-center gap-2`}>
              <Users className="h-5 w-5" /> Session
            </h1>
            <p className="text-sm text-gray-400 mt-1">Create or join a sync session to share world data in real time.</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded transition-colors"
            >
              {loading ? 'Creating…' : 'Create Session'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700" /></div>
              <div className="relative flex justify-center"><span className="bg-gray-900 px-3 text-xs text-gray-500">or</span></div>
            </div>

            <form
              className="flex items-center gap-2"
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
                placeholder="Enter code or paste link"
                className="flex-1 px-3 py-2.5 bg-gray-800 border border-gray-700 text-white rounded font-mono text-center uppercase placeholder:text-gray-500 placeholder:font-sans placeholder:normal-case focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="submit"
                disabled={loading || !/^[A-HJ-NP-Z2-9]{6}$/.test(joinCode.trim())}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded transition-colors"
              >
                {loading ? '…' : 'Join'}
              </button>
            </form>
            {badPaste && <p className="text-xs text-red-400">Not a valid code or link</p>}
          </div>

          {session.error && (
            <button
              onClick={onDismissError}
              className="mt-4 text-red-400 text-xs hover:text-red-300 transition-colors"
              title={`${session.error} (click to dismiss)`}
            >
              {session.error}
            </button>
          )}

          <button
            onClick={onBack}
            className="mt-6 w-full bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2.5 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // ─── Active session ───
  const reconnectText = getReconnectText();

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.prominent} flex items-center gap-2`}>
            <Users className="h-5 w-5" /> Session
          </h1>
        </div>

        {/* Connection status */}
        <div className="bg-gray-800 border border-gray-700 rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[session.status]}`} />
              <span className={`text-sm font-medium ${TEXT_COLOR.prominent}`}>{STATUS_LABELS[session.status]}</span>
            </div>
            <span className="text-xs text-gray-500">
              {session.clientCount} {session.clientCount === 1 ? 'member' : 'members'}
              {session.scouts > 0 && ` · ${session.scouts} ${session.scouts === 1 ? 'scout' : 'scouts'}`}
            </span>
          </div>

          {reconnectText && (
            <p className={`text-xs ${CONNECTION_COLOR.connectingText}`}>{reconnectText}</p>
          )}

          {canRejoin && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Connection lost.</span>
              <button
                onClick={() => onRejoinSession(session.code!)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
              >
                Rejoin
              </button>
            </div>
          )}

          {/* Session code + copy */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Code:</span>
            <span className="font-mono font-bold text-base text-white tracking-wider">{session.code}</span>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              title="Copy session link"
            >
              {copied ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></> : <><Copy className="w-3 h-3" /><span>Copy link</span></>}
            </button>
          </div>
        </div>

        {/* Alt1 Pairing */}
        {isConnected && (
          <div className="bg-gray-800 border border-gray-700 rounded p-4 space-y-3">
            <h2 className={`text-sm font-medium ${TEXT_COLOR.prominent}`}>Alt1 Scout Pairing</h2>

            {session.isPaired ? (
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1.5 ${CONNECTION_COLOR.connectedText} text-sm`}>
                  <Link2 className="w-4 h-4" /> Paired
                </span>
                <button
                  onClick={onUnpair}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Unpair
                </button>
              </div>
            ) : session.pairToken ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Pair code:</span>
                  <span className="font-mono font-bold text-amber-300 tracking-widest text-lg">{session.pairToken}</span>
                  <button
                    onClick={handleCopyToken}
                    className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    {tokenCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {tokenCountdown !== null && (
                  <p className="text-xs text-gray-500">Expires in {tokenCountdown}s</p>
                )}
              </div>
            ) : (
              <button
                onClick={onRequestPairToken}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
              >
                Generate pair code
              </button>
            )}
          </div>
        )}

        {/* Managed session */}
        {isConnected && (
          <div className="bg-gray-800 border border-gray-700 rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`text-sm font-medium ${TEXT_COLOR.prominent} flex items-center gap-1.5`}>
                <Shield className="w-4 h-4" /> Managed Mode
              </h2>
              {session.managed && (
                <span className="text-xs text-green-500">Active</span>
              )}
            </div>

            {session.managed ? (
              <MemberPanel
                members={session.members}
                myRole={session.memberRole}
                lastInvite={session.lastInvite}
                onCreateInvite={onCreateInvite}
                onBanMember={onBanMember}
                onSetMemberRole={onSetMemberRole}
              />
            ) : (
              <>
                <p className="text-xs text-gray-400">Enable invite-only mode with named members and role-based permissions.</p>
                <button
                  onClick={onEnableManaged}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                >
                  Enable managed mode
                </button>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {session.error && (
          <button
            onClick={onDismissError}
            className="w-full text-left text-red-400 text-xs hover:text-red-300 transition-colors bg-red-900/20 border border-red-800/30 rounded p-3"
            title="Click to dismiss"
          >
            {session.error}
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onBack}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2.5 transition-colors"
          >
            Close
          </button>
          <button
            onClick={onLeaveSession}
            className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 font-medium rounded transition-colors"
          >
            Leave Session
          </button>
        </div>
      </div>
    </div>
  );
}
