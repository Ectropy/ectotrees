import { useState } from 'react';
import { Link2, Shield, Users, Copy, Check, ExternalLink } from 'lucide-react';
import type { SessionState } from '../hooks/useSession';
import { Switch } from '@/components/ui/switch';
import { extractSessionCode, buildSessionUrl, buildInviteUrl, validateSessionCode } from '../lib/sessionUrl';
import { useCountdown } from '../hooks/useCountdown';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { formatReconnectMessage } from '../../shared/reconnect.ts';
import { CONNECTION_COLOR, STATUS_DOT_COLORS, TEXT_COLOR, BUTTON_SECONDARY } from '../constants/toolColors';
import { MemberPanel } from './MemberPanel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SessionViewProps {
  session: SessionState;
  activeLocalCount: number;
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code: string) => boolean;
  onRequestSessionJoin: (code: string) => Promise<void>;
  onRejoinSession: (code: string) => void;
  onLeaveSession: () => void;
  onDismissError: () => void;
  onForkToManaged: (name: string) => void;
  onJoinManagedFork: (managedCode: string, name: string, selfRegisterToken: string, personalToken?: string) => Promise<void>;
  onCreateInvite: (name: string, role?: 'scout' | 'viewer') => void;
  onBanMember: (inviteToken: string) => void;
  onRenameMember: (inviteToken: string, name: string) => void;
  onSetMemberRole: (inviteToken: string, role: 'moderator' | 'scout' | 'viewer') => void;
  onTransferOwnership: (inviteToken: string) => void;
  onSetAllowViewers: (allow: boolean) => void;
  onRequestPersonalToken: () => void;
  onBack: () => void;
  followScout: boolean;
  onFollowScoutChange: (value: boolean) => void;
}

const STATUS_LABELS: Record<SessionState['status'], string> = {
  connected:    'Connected',
  connecting:   'Connecting…',
  disconnected: 'Disconnected',
};

// window.location.origin is constant for the page lifetime
const ALT1_INSTALL_LINK = `alt1://addapp/${window.location.origin}/alt1/appconfig.json`;

export function SessionView({
  session, activeLocalCount,
  onCreateSession, onJoinSession, onRequestSessionJoin, onRejoinSession, onLeaveSession,
  onDismissError, onForkToManaged, onJoinManagedFork,
  onCreateInvite, onBanMember, onSetMemberRole, onBack,
  onSetAllowViewers, onRequestPersonalToken,
  followScout, onFollowScoutChange,
}: SessionViewProps) {
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { copied, copy: copyCode } = useCopyFeedback();
  const { copied: tokenCopied, copy: copyToken } = useCopyFeedback();
  const countdown = useCountdown(session.reconnectAt ?? null);
  const forkCountdown = useCountdown(session.forkInvite?.expiresAt ?? null, 1000);
  const [badPaste, setBadPaste] = useState(false);
  const [managedSetupStep, setManagedSetupStep] = useState<'idle' | 'naming'>('idle');
  const [managedName, setManagedName] = useState('');
  const [joinForkStep, setJoinForkStep] = useState<'idle' | 'naming'>('idle');
  const [joinForkName, setJoinForkName] = useState('');

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
    await copyCode(buildSessionUrl(session.code));
  }

  function getReconnectText(): string | null {
    if (session.status !== 'connecting') return null;
    return formatReconnectMessage(session.reconnectAttempt, countdown);
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
            <p className={`text-sm ${TEXT_COLOR.muted} mt-1`}>Create or join a sync session to share world data in real time.</p>
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
                disabled={loading || !validateSessionCode(joinCode.trim())}
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
            className={`mt-6 w-full ${BUTTON_SECONDARY} py-2.5`}
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
            <span className={`text-xs ${TEXT_COLOR.muted}`}>Code:</span>
            <span className="font-mono font-bold text-base text-white tracking-wider">{session.code}</span>
            <button
              onClick={handleCopyCode}
              className={`flex items-center gap-1 text-xs ${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}
              title="Copy session link"
            >
              {copied ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></> : <><Copy className="w-3 h-3" /><span>Copy link</span></>}
            </button>
          </div>
        </div>

        {/* Alt1 Scout Link */}
        {isConnected && (
          <div className="bg-gray-800 border border-gray-700 rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`text-sm font-medium ${TEXT_COLOR.prominent}`}>Ectotrees Scout Alt1 plugin <TooltipProvider><Tooltip><TooltipTrigger asChild><sup className="text-xs font-normal text-amber-400 cursor-help">Beta</sup></TooltipTrigger><TooltipContent side="top" className="max-w-56 bg-[#1e1e2a] border border-gray-700 text-gray-200 [&_.fill-primary]:fill-[#1e1e2a]">Ectotrees Scout may have bugs and not all intended features are implemented. Please report issues on GitHub.</TooltipContent></Tooltip></TooltipProvider></h2>
              <a
                href={ALT1_INSTALL_LINK}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors"
                title="Install Alt1 plugin"
              >
                Install <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className={`text-xs ${TEXT_COLOR.muted}`}>Scout currently allows auto-detection of world hops, and can automatically read the Spirit Trees's dialog box to gather timer and hint intel. Requires <a href='https://runeapps.org/alt1' className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">Alt1 Toolkit</a>.</p>
            {session.personalToken ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${TEXT_COLOR.muted}`}>Your Alt1 code:</span>
                  <span className="font-mono font-bold text-amber-300 tracking-widest text-lg">{session.personalToken}</span>
                  <button
                    onClick={() => copyToken(buildInviteUrl(session.personalToken!))}
                    className={`text-xs ${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}
                  >
                    {tokenCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {session.scoutWorld !== null && (
                  <div className="flex items-center gap-2">
                    <Link2 className={`w-3.5 h-3.5 ${CONNECTION_COLOR.connectedText}`} />
                    <span className={`text-xs ${CONNECTION_COLOR.connectedText}`}>Scout linked — world {session.scoutWorld}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${TEXT_COLOR.muted}`}>Follow scout's world</span>
                  <Switch
                    checked={followScout}
                    onCheckedChange={onFollowScoutChange}
                    className="data-[state=checked]:bg-white data-[state=unchecked]:bg-gray-600"
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={session.managed ? undefined : onRequestPersonalToken}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
              >
                {session.managed ? 'Your invite token is your Alt1 code' : 'Get Alt1 Code'}
              </button>
            )}
          </div>
        )}

        {/* Managed session */}
        {isConnected && (
          <div className="bg-gray-800 border border-gray-700 rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className={`text-sm font-medium ${TEXT_COLOR.prominent} flex items-center gap-1.5`}>
                <Shield className="w-4 h-4" /> Managed Mode <TooltipProvider><Tooltip><TooltipTrigger asChild><sup className="text-xs font-normal text-amber-400 cursor-help">Beta</sup></TooltipTrigger><TooltipContent side="top" className="max-w-56 bg-[#1e1e2a] border border-gray-700 text-gray-200 [&_.fill-primary]:fill-[#1e1e2a]">Managed mode is in beta. Members, roles, and invite links are experimental features. Expect rough edges and please report issues on GitHub.</TooltipContent></Tooltip></TooltipProvider>
              </h2>
              {session.managed && (
                <span className="text-xs text-green-500">Active</span>
              )}
            </div>

            {session.managed ? (
              <>
              <MemberPanel
                members={session.members}
                myRole={session.memberRole}
                myName={session.memberName}
                lastInvite={session.lastInvite}
                onCreateInvite={onCreateInvite}
                onBanMember={onBanMember}
                onSetMemberRole={onSetMemberRole}
              />
              {(session.memberRole === 'owner' || session.memberRole === 'moderator') && (
                <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                  <span className={`text-xs ${TEXT_COLOR.muted}`}>Allow public viewers</span>
                  <Switch
                    checked={session.allowViewers}
                    onCheckedChange={onSetAllowViewers}
                    className="data-[state=checked]:bg-white data-[state=unchecked]:bg-gray-600"
                  />
                </div>
              )}
              </>
            ) : session.forkInvite && (forkCountdown === null || forkCountdown > 0) ? (
              /* A fork invite is live — show join prompt */
              <div className="space-y-3">
                <div className="bg-amber-900/20 border border-amber-700/40 rounded p-3 space-y-2">
                  <p className={`text-xs font-medium text-amber-300`}>
                    <span className="font-bold">{session.forkInvite.initiatorName}</span> created a managed fork of this session
                  </p>
                  <p className={`text-xs ${TEXT_COLOR.muted}`}>
                    Members with invite links can join the managed session. The original session remains open.
                    {forkCountdown !== null && forkCountdown > 0 && (
                      <> Invite expires in {forkCountdown}s.</>
                    )}
                  </p>
                  {session.forkInvite.selfRegisterToken ? (
                    joinForkStep === 'naming' ? (
                      <form
                        className="flex gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const name = joinForkName.trim();
                          if (!name) return;
                          setJoinForkStep('idle');
                          setJoinForkName('');
                          await onJoinManagedFork(session.forkInvite!.managedCode, name, session.forkInvite!.selfRegisterToken!, session.forkInvite!.personalToken);
                        }}
                      >
                        <input
                          autoFocus
                          value={joinForkName}
                          onChange={e => setJoinForkName(e.target.value)}
                          placeholder="Your name"
                          maxLength={32}
                          className="flex-1 min-w-0 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="submit"
                          disabled={!joinForkName.trim()}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs rounded transition-colors"
                        >
                          Join →
                        </button>
                        <button
                          type="button"
                          onClick={() => { setJoinForkStep('idle'); setJoinForkName(''); }}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setJoinForkStep('naming')}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded transition-colors"
                        >
                          Join managed session →
                        </button>
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(session.forkInvite!.inviteLink).catch(() => {});
                          }}
                          className={`px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors flex items-center gap-1`}
                          title="Copy join link"
                        >
                          <Copy className="w-3 h-3" /> Copy link
                        </button>
                      </div>
                    )
                  ) : (
                    <p className={`text-xs ${TEXT_COLOR.muted}`}>
                      You were not present when this fork was created — no invite slot is available.
                    </p>
                  )}
                </div>
                {managedSetupStep === 'naming' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = managedName.trim();
                      if (!name) return;
                      onForkToManaged(name);
                      setManagedSetupStep('idle');
                      setManagedName('');
                    }}
                    className="space-y-2"
                  >
                    <label className="block text-xs text-gray-400">
                      Create a separate managed fork with you as owner
                    </label>
                    <input
                      type="text"
                      value={managedName}
                      onChange={(e) => setManagedName(e.target.value.slice(0, 30))}
                      placeholder="Your username"
                      maxLength={30}
                      autoFocus
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 text-white rounded text-xs placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={!managedName.trim()}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
                      >
                        Fork
                      </button>
                      <button
                        type="button"
                        onClick={() => { setManagedSetupStep('idle'); setManagedName(''); }}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setManagedSetupStep('naming')}
                    className={`text-xs ${TEXT_COLOR.muted} hover:text-gray-300 transition-colors`}
                  >
                    Or create your own managed fork →
                  </button>
                )}
              </div>
            ) : managedSetupStep === 'naming' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = managedName.trim();
                  if (!name) return;
                  onForkToManaged(name);
                  setManagedSetupStep('idle');
                  setManagedName('');
                }}
                className="space-y-2"
              >
                <label className="block text-xs text-gray-300">
                  Your username <span className="text-gray-500">(visible to all members)</span>
                </label>
                <input
                  type="text"
                  value={managedName}
                  onChange={(e) => setManagedName(e.target.value.slice(0, 30))}
                  placeholder="Enter your username"
                  maxLength={30}
                  autoFocus
                  className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 text-white rounded text-xs placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!managedName.trim()}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs rounded transition-colors"
                  >
                    Fork to managed
                  </button>
                  <button
                    type="button"
                    onClick={() => { setManagedSetupStep('idle'); setManagedName(''); }}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <ul className={`text-xs ${TEXT_COLOR.muted} space-y-1 list-disc list-inside`}>
                  <li>Creates a new managed session with a snapshot of current world data</li>
                  <li>All members are invited to join — the original session is unchanged</li>
                  <li>New members must join via a personal invite link</li>
                  <li>Each member has a username and role (Owner, Moderator, Scout, Viewer)</li>
                </ul>
                <button
                  onClick={() => setManagedSetupStep('naming')}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                >
                  Fork to managed session →
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
            className={`flex-1 ${BUTTON_SECONDARY} py-2.5`}
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
