import { useState } from 'react';
import { Circle, LoaderCircle, CircleX, Link, Unlink, Copy, Check } from 'lucide-react';
import { SplitButton, SplitButtonSegment } from './ui/split-button';
import type { SessionState, SessionStatus } from '../hooks/useSession';
import { buildSessionUrl, buildIdentityUrl } from '../lib/sessionUrl';
import { useCountdown } from '../hooks/useCountdown';
import { useCopyFeedback } from '../hooks/useCopyFeedback';
import { formatReconnectMessage } from '../../shared/reconnect.ts';
import { CONNECTION_COLOR, STATUS_BORDER_COLORS, STATUS_HOVER_BG, STATUS_DIVIDE_COLORS, TREE_COLOR, SPAWN_COLOR, ALT1_COLOR, ALT1_BORDER_COLOR, ALT1_DIVIDE_COLOR, ALT1_HOVER_BG, MANAGED_COLOR, ERROR_COLOR } from '../constants/toolColors';
import { MemberCount } from './MemberCount';

interface SessionBarProps {
  session: SessionState;
  onCreateSession: () => Promise<string | null>;
  onRejoinSession: (code: string) => void;
  onLeaveSession: () => void;
  onDismissError: () => void;
  onOpenSession: () => void;
  onRequestIdentityToken: () => void;
  onLinkWithAlt1: () => Promise<string | null>;
  onOpenBrowser: () => void;
  forkDismissed: boolean;
}


function DismissableError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <button
      onClick={onDismiss}
      className={`${ERROR_COLOR.text} text-xs ${ERROR_COLOR.textHover} transition-colors`}
      title={`${message} (click to dismiss)`}
    >
      {message}
    </button>
  );
}

function StatusDot({ status }: { status: SessionStatus }) {
  if (status === 'connected')
    return <Circle className="w-3 h-3 flex-shrink-0 fill-current text-green-500" />;
  if (status === 'connecting')
    return <LoaderCircle className="w-3 h-3 flex-shrink-0 text-yellow-500 animate-spin" />;
  return <CircleX className="w-3 h-3 flex-shrink-0 text-red-500" />;
}

export function SessionBar({ session, onCreateSession, onRejoinSession, onLeaveSession, onDismissError, onOpenSession, onRequestIdentityToken, onLinkWithAlt1, onOpenBrowser, forkDismissed }: SessionBarProps) {
  const [loading, setLoading] = useState(false);
  const { copied, copy: copyCode } = useCopyFeedback(1500);
  const { copied: tokenCopied, copy: copyToken } = useCopyFeedback(1500);
  const countdown = useCountdown(session.reconnectAt ?? null);

  async function handleCreate() {
    setLoading(true);
    await onCreateSession();
    setLoading(false);
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
        {/* Compound status button: dot + name/code + copy icon */}
        <SplitButton
          borderClass={STATUS_BORDER_COLORS[session.status]}
          divideClass={STATUS_DIVIDE_COLORS[session.status]}
          hoverClass={STATUS_HOVER_BG[session.status]}
        >
          {session.managed ? (
            <SplitButtonSegment onClick={onOpenSession} className="gap-1.5" title="Open session panel">
              <StatusDot status={session.status} />
              <span className={`font-bold text-white text-xs ${session.sessionName ? '' : 'font-mono'}`}>
                {session.sessionName ?? session.code}
              </span>
              {canRejoin && <span className="text-red-400 font-normal">— Disconnected</span>}
            </SplitButtonSegment>
          ) : (
            <SplitButtonSegment onClick={() => { if (!canRejoin) { handleCopyCode(); } onOpenSession(); }} className="gap-1.5" title={canRejoin ? 'Open session panel' : 'Copy session link & open session panel'}>
              <StatusDot status={session.status} />
              <span className="font-mono font-bold text-white tracking-wider">{session.code}</span>
              {canRejoin && <span className="text-red-400 font-normal font-sans tracking-normal">— Disconnected</span>}
            </SplitButtonSegment>
          )}
          {!canRejoin && (
            <SplitButtonSegment onClick={handleCopyCode} className="px-1.5" title="Copy session link">
              {copied
                ? <Check className="w-3 h-3 text-green-400" />
                : <Copy className="w-3 h-3 text-white" />
              }
            </SplitButtonSegment>
          )}
        </SplitButton>

        {/* Alt1 Scout link — token display when connected and have token */}
        {isConnected && !canRejoin && session.identityToken && (
          <SplitButton
            borderClass={ALT1_BORDER_COLOR}
            divideClass={ALT1_DIVIDE_COLOR}
            hoverClass={ALT1_HOVER_BG}
          >
            <SplitButtonSegment
              className="gap-1.5"
              onClick={() => { copyToken(buildIdentityUrl(session.identityToken!)); onOpenSession(); }}
              title="Copy Alt1 link & open session panel"
            >
              {session.scoutConnected
                ? <Link className={`w-3 h-3 ${ALT1_COLOR.text}`} />
                : <Unlink className="w-3 h-3 text-gray-500" />
              }
              <span className="font-mono font-bold text-white tracking-wider">
                {session.identityToken}
              </span>
            </SplitButtonSegment>
            <SplitButtonSegment
              className="px-1.5"
              onClick={() => copyToken(buildIdentityUrl(session.identityToken!))}
              title="Copy Alt1 link"
            >
              {tokenCopied
                ? <Check className="w-3 h-3 text-green-400" />
                : <Copy className="w-3 h-3" />
              }
            </SplitButtonSegment>
          </SplitButton>
        )}

        {/* Link with Alt1 button — when no personal token and not in managed mode */}
        {isConnected && !session.identityToken && !session.managed && (
          <button
            onClick={isConnected ? onRequestIdentityToken : onLinkWithAlt1}
            className={`text-xs px-1.5 py-0.5 bg-transparent ${ALT1_COLOR.border} ${ALT1_COLOR.label} ${ALT1_COLOR.borderHover} rounded transition-colors`}
            title="Get a code to link your Ectotrees Scout Alt1 plugin"
          >
            Link with Alt1
          </button>
        )}

        {reconnectText && (
          <span className={`text-xs flex-shrink-0 ${CONNECTION_COLOR.connectingText}`}>{reconnectText}</span>
        )}


        {canRejoin && (
          <>
            <button
              onClick={() => onRejoinSession(session.code!)}
              className="px-2 py-0.5 bg-transparent border border-yellow-400 text-yellow-400 hover:bg-yellow-400/20 text-xs rounded transition-colors flex-shrink-0"
            >
              Rejoin?
            </button>
            <button
              onClick={onLeaveSession}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
            >
              Leave
            </button>
          </>
        )}

        {session.error && session.errorKind === 'application' && (
          <DismissableError message={session.error} onDismiss={onDismissError} />
        )}

        {/* Fork invite indicator */}
        {session.forkInvite && session.forkInvite.selfRegisterToken && !session.managed && !forkDismissed && (
          <button
            onClick={onOpenSession}
            className={`flex items-center gap-1.5 px-2 py-0.5 ${MANAGED_COLOR.border} ${MANAGED_COLOR.borderHover} ${MANAGED_COLOR.label} text-xs rounded transition-colors flex-shrink-0`}
            title={`${session.forkInvite.initiatorName} created a managed fork of this session. Click to view or join.`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse flex-shrink-0" />
            Managed session available
          </button>
        )}

        {/* Right side: member count */}
        {!canRejoin && (
          <MemberCount clientCount={session.clientCount} scouts={session.scouts} className="ml-auto" />
        )}

      </div>
    );
  }

  // No active session
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gray-800 rounded text-xs flex-shrink-0">
      <button
        onClick={handleCreate}
        disabled={loading}
        className={`px-2 py-0.5 border ${TREE_COLOR.border} ${TREE_COLOR.label} ${TREE_COLOR.borderHover} disabled:opacity-50 text-white rounded transition-colors`}
      >
        {loading ? '...' : 'Create Session'}
      </button>

      <button
        onClick={onOpenBrowser}
        className={`px-2 py-0.5 bg-transparent ${SPAWN_COLOR.border} ${SPAWN_COLOR.label} ${SPAWN_COLOR.borderHover} rounded transition-colors`}
      >
        Join a Session
      </button>

      <button
        onClick={onLinkWithAlt1}
        className={`text-xs px-1.5 py-0.5 bg-transparent ${ALT1_COLOR.border} ${ALT1_COLOR.label} ${ALT1_COLOR.borderHover} rounded transition-colors`}
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
