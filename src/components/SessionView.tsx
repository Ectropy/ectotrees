import { useState } from 'react';
import { Link2, Users, Copy, Check, ExternalLink, HelpCircle } from 'lucide-react';
import type { SessionState } from '../hooks/useSession';
import { Switch } from '@/components/ui/switch';
import { buildSessionUrl, buildIdentityUrl } from '../lib/sessionUrl';
import { useCountdown } from '../hooks/useCountdown';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { formatReconnectMessage } from '../../shared/reconnect.ts';
import { CONNECTION_COLOR, STATUS_DOT_COLORS, TEXT_COLOR, BUTTON_SECONDARY, ALT1_COLOR, MANAGED_COLOR, ROLE_COLORS, ROLE_LABELS, DEAD_COLOR, ERROR_COLOR } from '../constants/toolColors';
import { MemberPanel } from './MemberPanel';
import { MemberCount } from './MemberCount';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface LeaveConfirmPanelProps {
  leaveStep: 'idle' | 'confirming';
  onConfirm: () => void;
  onCancel: () => void;
  onLeave: () => void;
  onBack: () => void;
  panelBorderClass: string;
  title: string;
  body: string;
  link?: string;
  linkLabel?: string;
  linkCopied: boolean;
  onCopyLink: () => void;
}

function LeaveConfirmPanel({ leaveStep, onConfirm, onCancel, onLeave, onBack, panelBorderClass, title, body, link, linkLabel, linkCopied, onCopyLink }: LeaveConfirmPanelProps) {
  if (leaveStep === 'confirming') {
    return (
      <div className={`${panelBorderClass} rounded p-3 space-y-2`}>
        <p className="text-yellow-300 text-sm font-medium">{title}</p>
        <p className="text-gray-400 text-xs">{body}</p>
        {link && (
          <div className="space-y-1">
            <p className="text-gray-500 text-xs">{linkLabel}</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 truncate"
              />
              <button
                onClick={onCopyLink}
                className={`px-3 py-1 text-xs rounded border ${linkCopied ? 'border-green-600 text-green-400' : 'border-gray-600 text-gray-300 hover:border-gray-500'} transition-colors flex items-center gap-1`}
              >
                {linkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {linkCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className={`flex-1 ${BUTTON_SECONDARY} py-2`}>
            Cancel
          </button>
          <button
            onClick={onLeave}
            className={`px-4 py-2 bg-transparent ${DEAD_COLOR.border} ${DEAD_COLOR.label} ${DEAD_COLOR.borderHover} text-sm font-medium rounded transition-colors`}
          >
            Leave Session
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <button onClick={onBack} className={`flex-1 ${BUTTON_SECONDARY} py-2.5`}>
        Close
      </button>
      <button
        onClick={onConfirm}
        className={`px-4 py-2.5 bg-transparent ${DEAD_COLOR.border} ${DEAD_COLOR.label} ${DEAD_COLOR.borderHover} font-medium rounded transition-colors`}
      >
        Leave Session
      </button>
    </div>
  );
}

interface SessionViewProps {
  session: SessionState;
  onRejoinSession: (code: string) => void;
  onLeaveSession: () => void;
  onDismissError: () => void;
  onForkToManaged: (name: string) => void;
  onJoinManagedFork: (managedCode: string, name: string, selfRegisterToken: string, identityToken?: string) => Promise<void>;
  onCreateInvite: (name: string, role?: 'scout' | 'viewer') => void;
  onKickMember: (identityToken: string) => void;
  onBanMember: (identityToken: string) => void;
  onRenameMember: (identityToken: string, name: string) => void;
  onSetMemberRole: (identityToken: string, role: 'moderator' | 'scout' | 'viewer') => void;
  onTransferOwnership: (identityToken: string) => void;
  onSetAllowOpenJoin: (allow: boolean) => void;
  onUpdateSessionSettings: (settings: { name?: string; description?: string; listed?: boolean }) => void;
  onRequestIdentityToken: () => void;
  onBack: () => void;
  followScout: boolean;
  onFollowScoutChange: (value: boolean) => void;
  forkDismissed: boolean;
  onDismissFork: () => void;
}

// window.location.origin is constant for the page lifetime
const ALT1_INSTALL_LINK = `alt1://addapp/${window.location.origin}/alt1/appconfig.json`;

export function SessionView({
  session,
  onRejoinSession, onLeaveSession,
  onDismissError, onForkToManaged, onJoinManagedFork,
  onCreateInvite, onKickMember, onBanMember, onSetMemberRole, onBack,
  onSetAllowOpenJoin, onUpdateSessionSettings, onRequestIdentityToken,
  followScout, onFollowScoutChange,
  forkDismissed, onDismissFork,
}: SessionViewProps) {
  const { copied: codeCopied, copy: copyCode } = useCopyFeedback(1500);
  const { copied: linkCopied, copy: copyLink } = useCopyFeedback(1500);
  const { copied: tokenCopied, copy: copyToken } = useCopyFeedback(1500);
  const countdown = useCountdown(session.reconnectAt ?? null);
  const forkCountdown = useCountdown(session.forkInvite?.expiresAt ?? null, 1000);
  const [managedSetupStep, setManagedSetupStep] = useState<'idle' | 'naming'>('idle');
  const [managedName, setManagedName] = useState('');
  const [joinForkStep, setJoinForkStep] = useState<'idle' | 'naming'>('idle');
  const [joinForkName, setJoinForkName] = useState('');
  const [alt1Expanded, setAlt1Expanded] = useState(() => !!session.identityToken);
  const [prevIdentityToken, setPrevIdentityToken] = useState(session.identityToken);
  if (session.identityToken !== prevIdentityToken) {
    setPrevIdentityToken(session.identityToken);
    if (session.identityToken && !prevIdentityToken) {
      setAlt1Expanded(true);
    }
  }
  const [leaveStep, setLeaveStep] = useState<'idle' | 'confirming'>('idle');
  const { copied: leaveLinkCopied, copy: copyLeaveLink } = useCopyFeedback(1500);

  // Managed session settings (inline — replaces SessionSettingsPanel)
  const [nameInput, setNameInput] = useState(session.sessionName ?? '');
  const [descInput, setDescInput] = useState(session.sessionDescription ?? '');
  const [listedInput, setListedInput] = useState(session.sessionListed);
  const [prevSettings, setPrevSettings] = useState({ name: session.sessionName, desc: session.sessionDescription, listed: session.sessionListed });

  if (prevSettings.name !== session.sessionName || prevSettings.desc !== session.sessionDescription || prevSettings.listed !== session.sessionListed) {
    setPrevSettings({ name: session.sessionName, desc: session.sessionDescription, listed: session.sessionListed });
    setNameInput(session.sessionName ?? '');
    setDescInput(session.sessionDescription ?? '');
    setListedInput(session.sessionListed);
  }

  const hasSettingsChanges = nameInput !== (session.sessionName ?? '') || descInput !== (session.sessionDescription ?? '');

  function getReconnectText(): string | null {
    if (session.status !== 'connecting') return null;
    return formatReconnectMessage(session.reconnectAttempt, countdown);
  }

  const isConnected = session.status === 'connected';
  const canRejoin = session.status === 'disconnected' && session.code !== null;
  const isAdmin = session.memberRole === 'owner' || session.memberRole === 'moderator';

  // No active session — should not reach here; App.tsx routes to SessionBrowserView
  if (!session.code) return null;

  const reconnectText = getReconnectText();

  // ─── Anonymous session view ───
  if (!session.managed) {
    return (
      <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Header */}
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.prominent} flex items-center gap-2`}>
            <Users className="h-5 w-5" /> Session
          </h1>

          {/* Session name line */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[session.status]}`} />
              <span className={`text-xs ${TEXT_COLOR.muted}`}>Session Name</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold text-base ${TEXT_COLOR.prominent} tracking-wider`}>{session.code}</span>
                <span className={`text-xs ${TEXT_COLOR.muted}`}>
                  (Anonymous session)
                </span>
              </div>
              <MemberCount clientCount={session.clientCount} scouts={session.scouts} className="text-xs" />
            </div>
          </div>

          {/* Connection issues */}
          {reconnectText && (
            <p className={`text-xs ${CONNECTION_COLOR.connectingText}`}>{reconnectText}</p>
          )}
          {canRejoin && (
            <div className="flex items-center gap-2">
              <span className={`text-xs ${ERROR_COLOR.text}`}>Connection lost.</span>
              <button
                onClick={() => onRejoinSession(session.code!)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
              >
                Rejoin
              </button>
            </div>
          )}

          {/* Copy buttons + share text */}
          {isConnected && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyCode(session.code!)}
                  className={`flex items-center gap-1.5 text-xs ${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}
                >
                  {codeCopied
                    ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                    : <><Copy className="w-3 h-3" /><span>Copy join code</span></>
                  }
                </button>
                <button
                  onClick={() => copyLink(buildSessionUrl(session.code!))}
                  className={`flex items-center gap-1.5 text-xs ${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}
                >
                  {linkCopied
                    ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                    : <><Copy className="w-3 h-3" /><span>Copy join link</span></>
                  }
                </button>
              </div>
              <p className={`text-xs ${TEXT_COLOR.faint}`}>Share to invite others to join this session.</p>
            </div>
          )}

          {/* Link with Alt1 */}
          {isConnected && (
            alt1Expanded && session.identityToken ? (
              <Alt1LinkedSection
                identityToken={session.identityToken}
                scoutWorld={session.scoutWorld}
                followScout={followScout}
                onFollowScoutChange={onFollowScoutChange}
                tokenCopied={tokenCopied}
                copyToken={copyToken}
              />
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (session.identityToken) {
                      setAlt1Expanded(true);
                    } else {
                      onRequestIdentityToken();
                      setAlt1Expanded(true);
                    }
                  }}
                  className={`${ALT1_COLOR.border} ${ALT1_COLOR.label} ${ALT1_COLOR.borderHover} px-3 py-1.5 text-xs rounded transition-colors`}
                >
                  Link with Alt1 →
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}>
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right">
                    <p className="mb-2">Scout currently allows auto-detection of world hops, and can automatically read the Spirit Tree's dialog box to gather timer and hint intel.</p>
                    <p>Requires <a href="https://runeapps.org/alt1" className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">Alt1 Toolkit</a>. <a href={ALT1_INSTALL_LINK} className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 underline">Install plugin <ExternalLink className="w-3 h-3 inline" /></a></p>
                  </PopoverContent>
                </Popover>
              </div>
            )
          )}

          {/* Fork to Managed Session */}
          {isConnected && (
            session.forkInvite && session.forkInvite.selfRegisterToken && !forkDismissed && (forkCountdown === null || forkCountdown > 0) ? (
              <ForkInviteBanner
                session={session}
                forkCountdown={forkCountdown}
                joinForkStep={joinForkStep}
                setJoinForkStep={setJoinForkStep}
                joinForkName={joinForkName}
                setJoinForkName={setJoinForkName}
                onJoinManagedFork={onJoinManagedFork}
                onDismiss={onDismissFork}
              />
            ) : managedSetupStep === 'naming' ? (
              <ForkNameForm
                managedName={managedName}
                setManagedName={setManagedName}
                onForkToManaged={onForkToManaged}
                onCancel={() => { setManagedSetupStep('idle'); setManagedName(''); }}
              />
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setManagedSetupStep('naming')}
                  disabled={!!(session.forkInvite && (forkDismissed || !session.forkInvite.selfRegisterToken))}
                  className={`${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-xs rounded transition-colors`}
                >
                  Fork to Managed Session{session.forkInvite && forkCountdown !== null && forkCountdown > 0 && ` (${forkCountdown}s)`} →
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}>
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right">
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Creates a new managed session with a snapshot of current world data</li>
                      <li>All members are invited to join — the original session is unchanged</li>
                      <li>New members must join via a personal invite link</li>
                      <li>Each member has a username and role (Owner, Moderator, Scout, Viewer)</li>
                    </ul>
                  </PopoverContent>
                </Popover>
              </div>
            )
          )}

          {/* Identity line (if you somehow have a role in anon — e.g. during fork transitions) */}
          {session.memberName && session.memberRole && (
            <div className="flex items-center gap-2">
              <span className={`text-xs ${TEXT_COLOR.muted}`}>You:</span>
              <span className="text-xs text-gray-200">{session.memberName}</span>
              <span className={`text-xs ${ROLE_COLORS[session.memberRole]}`}>({ROLE_LABELS[session.memberRole]})</span>
            </div>
          )}

          {/* Error */}
          {session.error && (
            <button
              onClick={onDismissError}
              className={`w-full text-left ${ERROR_COLOR.text} text-xs ${ERROR_COLOR.textHover} transition-colors ${ERROR_COLOR.panelBorder} rounded p-3`}
              title="Click to dismiss"
            >
              {session.error}
            </button>
          )}

          {/* Actions / Leave confirmation */}
          <LeaveConfirmPanel
            leaveStep={leaveStep}
            onConfirm={() => setLeaveStep('confirming')}
            onCancel={() => setLeaveStep('idle')}
            onLeave={onLeaveSession}
            onBack={onBack}
            panelBorderClass={MANAGED_COLOR.panelBorder}
            title="Leave session?"
            body={session.identityToken
              ? "Save your personal link to rejoin as the same person later."
              : "Save this link to rejoin this session later."}
            link={session.identityToken ? buildIdentityUrl(session.identityToken) : buildSessionUrl(session.code!)}
            linkLabel={session.identityToken ? "Your personal link" : "Session link"}
            linkCopied={leaveLinkCopied}
            onCopyLink={() => copyLeaveLink(session.identityToken ? buildIdentityUrl(session.identityToken!) : buildSessionUrl(session.code!))}
          />
        </div>
      </div>
    );
  }

  // ─── Managed session view ───
  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <h1 className={`text-2xl font-bold ${TEXT_COLOR.prominent} flex items-center gap-2`}>
          <Users className="h-5 w-5" /> Session
        </h1>

        {/* Session panel */}
        <div className={`${MANAGED_COLOR.panelBorder} rounded p-3 space-y-3`}>
          {/* Session name line */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[session.status]}`} />
              <span className={`text-xs ${TEXT_COLOR.muted}`}>Session Name</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              {isAdmin ? (
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value.slice(0, 50))}
                  placeholder="Give your session a name..."
                  className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                  maxLength={50}
                />
              ) : (
                <span className={`text-sm font-medium ${TEXT_COLOR.prominent} truncate`}>
                  {session.sessionName || 'Managed Session'}
                </span>
              )}
              <MemberCount clientCount={session.clientCount} scouts={session.scouts} className="text-xs flex-shrink-0" />
            </div>
          </div>

          {/* Connection issues */}
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

          {/* Description (admin only) */}
          {isConnected && isAdmin && (
            <div>
              <label className={`text-xs ${TEXT_COLOR.muted} block mb-1`}>Description <span className={TEXT_COLOR.faint}>(optional)</span></label>
              <textarea
                value={descInput}
                onChange={e => setDescInput(e.target.value.slice(0, 200))}
                placeholder="Discord link, contact info, etc."
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-y min-h-[2.5rem] max-h-32"
                maxLength={200}
              />
            </div>
          )}

          {/* Save button (when name/desc changed) */}
          {isConnected && isAdmin && hasSettingsChanges && (
            <button
              onClick={() => {
                onUpdateSessionSettings({ name: nameInput, description: descInput, listed: session.sessionListed });
              }}
              className={`w-full ${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} text-sm py-1.5 rounded transition-colors`}
            >
              Save Settings
            </button>
          )}

          {/* Non-admin: read-only description */}
          {isConnected && session.managed && !isAdmin && session.sessionDescription && (
            <div>
              <span className={`text-xs ${TEXT_COLOR.muted} block mb-1`}>Description</span>
              <p className={`text-sm ${TEXT_COLOR.prominent}`}>{session.sessionDescription}</p>
            </div>
          )}

          {/* Visibility & Access (admin only) */}
          {isConnected && isAdmin && (
            <>
              <hr className="border-gray-700" />

              {/* Listed toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${TEXT_COLOR.prominent}`}>List in Session Browser</p>
                  <p className={`text-xs ${TEXT_COLOR.faint}`}>Others can find and join as viewers</p>
                </div>
                <Switch
                  checked={listedInput}
                  onCheckedChange={v => {
                    setListedInput(v);
                    onUpdateSessionSettings({ name: session.sessionName ?? '', description: session.sessionDescription ?? '', listed: v });
                  }}
                  disabled={!nameInput.trim()}
                  className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-600"
                />
              </div>

              {/* Open Join toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${TEXT_COLOR.prominent}`}>Open Join</p>
                  <p className={`text-xs ${TEXT_COLOR.faint}`}>Anyone can join as a scout, and self-report their name</p>
                </div>
                <Switch
                  checked={session.allowOpenJoin}
                  onCheckedChange={onSetAllowOpenJoin}
                  className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-gray-600"
                />
              </div>

              {/* Copy buttons — visible when listed */}
              {listedInput && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyCode(session.code!)}
                      className={`flex items-center gap-1.5 text-xs ${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}
                    >
                      {codeCopied
                        ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                        : <><Copy className="w-3 h-3" /><span>Copy join code</span></>
                      }
                    </button>
                    <button
                      onClick={() => copyLink(buildSessionUrl(session.code!))}
                      className={`flex items-center gap-1.5 text-xs ${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}
                    >
                      {linkCopied
                        ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                        : <><Copy className="w-3 h-3" /><span>Copy join link</span></>
                      }
                    </button>
                  </div>
                  <p className={`text-xs ${TEXT_COLOR.faint}`}>Share to invite others to view this session.</p>
                </div>
              )}
            </>
          )}
        </div>



        {/* Link with Alt1 — hide for viewers (anonymous or invited; they can't use Alt1) */}
        {isConnected && (!session.managed || (session.memberRole !== 'viewer' && session.memberRole !== null)) && (
          <div className={`${ALT1_COLOR.panelBorder} rounded p-3`}>
            {alt1Expanded && session.identityToken ? (
              <Alt1LinkedSection
                identityToken={session.identityToken}
                scoutWorld={session.scoutWorld}
                followScout={followScout}
                onFollowScoutChange={onFollowScoutChange}
                tokenCopied={tokenCopied}
                copyToken={copyToken}
              />
            ) : session.managed && session.identityToken ? (
              /* Managed sessions auto-have a token (it's the invite token) — show linked state directly */
              <Alt1LinkedSection
                identityToken={session.identityToken}
                scoutWorld={session.scoutWorld}
                followScout={followScout}
                onFollowScoutChange={onFollowScoutChange}
                tokenCopied={tokenCopied}
                copyToken={copyToken}
              />
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (session.identityToken) {
                      setAlt1Expanded(true);
                    } else if (!session.managed) {
                      onRequestIdentityToken();
                      setAlt1Expanded(true);
                    }
                  }}
                  className={`${ALT1_COLOR.border} ${ALT1_COLOR.label} ${ALT1_COLOR.borderHover} px-3 py-1.5 text-xs rounded transition-colors`}
                >
                  {session.managed ? 'Your invite token is your Alt1 code' : 'Link with Alt1 →'}
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={`${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}>
                      <HelpCircle className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right">
                    <p className="mb-2">Scout currently allows auto-detection of world hops, and can automatically read the Spirit Tree's dialog box to gather timer and hint intel.</p>
                    <p>Requires <a href="https://runeapps.org/alt1" className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">Alt1 Toolkit</a>. <a href={ALT1_INSTALL_LINK} className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 underline">Install plugin <ExternalLink className="w-3 h-3 inline" /></a></p>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        )}

        {/* Members */}
        {isConnected && (
          <div className={`${MANAGED_COLOR.panelBorder} rounded p-3 space-y-2`}>
            <h2 className={`text-sm font-medium ${TEXT_COLOR.prominent} flex items-center gap-1.5`}>
              <Users className="w-4 h-4" /> Members
            </h2>
            <MemberPanel
              members={session.members}
              myRole={session.memberRole}
              myName={session.memberName}
              lastInvite={session.lastInvite}
              onCreateInvite={onCreateInvite}
              onKickMember={onKickMember}
              onBanMember={onBanMember}
              onSetMemberRole={onSetMemberRole}
            />
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

        {/* Actions / Leave confirmation */}
        <LeaveConfirmPanel
          leaveStep={leaveStep}
          onConfirm={() => setLeaveStep('confirming')}
          onCancel={() => setLeaveStep('idle')}
          onLeave={onLeaveSession}
          onBack={onBack}
          panelBorderClass={MANAGED_COLOR.panelBorder}
          title="Leave managed session?"
          body={session.memberRole === 'owner'
            ? "You're the owner of this session! Please save your identity link before leaving. Without it, you cannot rejoin as the owner of this session."
            : session.identityToken
              ? "Coming back later? Save your identity link before leaving. Without it, you cannot rejoin with the same username."
              : "Are you sure you want to leave this session?"}
          link={session.identityToken ? buildIdentityUrl(session.identityToken) : undefined}
          linkLabel="Your personal link"
          linkCopied={leaveLinkCopied}
          onCopyLink={() => session.identityToken && copyLeaveLink(buildIdentityUrl(session.identityToken))}
        />
      </div>
    </div>
  );
}

// ─── Sub-components ───

function Alt1LinkedSection({
  identityToken, scoutWorld, followScout, onFollowScoutChange, tokenCopied, copyToken,
}: {
  identityToken: string;
  scoutWorld: number | null;
  followScout: boolean;
  onFollowScoutChange: (value: boolean) => void;
  tokenCopied: boolean;
  copyToken: (text: string) => Promise<boolean>;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-xs ${TEXT_COLOR.muted}`}>Alt1 code:</span>
        <span className={`font-mono font-bold ${ALT1_COLOR.text} tracking-wider text-base`}>{identityToken}</span>
        <button
          onClick={() => copyToken(buildIdentityUrl(identityToken))}
          className={`flex items-center gap-1 text-xs ${TEXT_COLOR.muted} hover:text-gray-200 transition-colors`}
        >
          {tokenCopied
            ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
            : <><Copy className="w-3 h-3" /><span>Copy</span></>
          }
        </button>
      </div>
      {scoutWorld !== null && (
        <div className="flex items-center gap-2">
          <Link2 className={`w-3.5 h-3.5 ${CONNECTION_COLOR.connectedText}`} />
          <span className={`text-xs ${CONNECTION_COLOR.connectedText}`}>Scout linked — world {scoutWorld}</span>
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
  );
}

function ForkInviteBanner({
  session, forkCountdown,
  joinForkStep, setJoinForkStep, joinForkName, setJoinForkName,
  onJoinManagedFork, onDismiss,
}: {
  session: SessionState;
  forkCountdown: number | null;
  joinForkStep: 'idle' | 'naming';
  setJoinForkStep: (v: 'idle' | 'naming') => void;
  joinForkName: string;
  setJoinForkName: (v: string) => void;
  onJoinManagedFork: (managedCode: string, name: string, selfRegisterToken: string, identityToken?: string) => Promise<void>;
  onDismiss: () => void;
}) {
  return (
    <div className={`${MANAGED_COLOR.panelBorder} rounded p-3 space-y-2`}>
      <p className="text-xs font-medium text-yellow-300">
        <span className="font-bold">{session.forkInvite!.initiatorName}</span> created a managed fork of this session
      </p>
      <p className={`text-xs ${TEXT_COLOR.muted}`}>
        You were here when it was created, so you may join without an invite. The original session will remain.
      </p>
      {session.forkInvite!.selfRegisterToken ? (
        joinForkStep === 'naming' ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = joinForkName.trim();
              if (!name) return;
              setJoinForkStep('idle');
              setJoinForkName('');
              await onJoinManagedFork(session.forkInvite!.managedCode, name, session.forkInvite!.selfRegisterToken!, session.forkInvite!.identityToken);
            }}
          >
            <input
              autoFocus
              value={joinForkName}
              onChange={e => setJoinForkName(e.target.value)}
              placeholder="Your username"
              maxLength={32}
              className="flex-1 min-w-0 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
            />
            <button
              type="submit"
              disabled={!joinForkName.trim()}
              className={`${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} disabled:opacity-40 px-3 py-1 text-xs rounded transition-colors`}
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setJoinForkStep('naming')}
              className={`${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} px-3 py-1.5 text-xs rounded transition-colors`}
            >
              Join managed session{forkCountdown !== null && forkCountdown > 0 && ` (${forkCountdown}s)`} →
            </button>
            <button
              onClick={onDismiss}
              className={`text-xs ${TEXT_COLOR.muted} hover:text-gray-300 transition-colors`}
            >
              Dismiss
            </button>
          </div>
        )
      ) : (
        <div className="flex items-center gap-2">
          <p className={`text-xs ${TEXT_COLOR.muted} flex-1`}>
            You were not present when this fork was created — no invite slot is available.
          </p>
          <button
            onClick={onDismiss}
            className={`text-xs ${TEXT_COLOR.muted} hover:text-gray-300 transition-colors flex-shrink-0`}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function ForkNameForm({
  managedName, setManagedName, onForkToManaged, onCancel, label,
}: {
  managedName: string;
  setManagedName: (v: string) => void;
  onForkToManaged: (name: string) => void;
  onCancel: () => void;
  label?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = managedName.trim();
        if (!name) return;
        onForkToManaged(name);
        setManagedName('');
      }}
      className="space-y-2"
    >
      <label className={`block text-xs ${label ? TEXT_COLOR.muted : 'text-gray-300'}`}>
        {label ?? <>Your username <span className="text-gray-500">(visible to all members)</span></>}
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
          className={`${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} disabled:opacity-50 px-3 py-1.5 text-xs rounded transition-colors`}
        >
          Fork to managed
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
