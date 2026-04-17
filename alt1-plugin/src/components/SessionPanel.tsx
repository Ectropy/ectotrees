import { useState, useEffect, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import type { SessionStatus } from '../hooks/useScoutSession';
import { useCountdown } from '@shared-browser/useCountdown';
import { useCopyFeedback } from '@shared-browser/useCopyFeedback';
import { buildIdentityUrl } from '@shared-browser/sessionUrl';
import { formatReconnectMessage } from '@shared/reconnect';

const VALID_TOKEN_RE = /^[A-HJ-NP-Z2-9]{12}$/;

interface SessionPanelProps {
  status: SessionStatus;
  identityToken: string | null;
  error: string | null;
  memberName: string | null;
  memberRole: string | null;
  reconnectAttempt: number;
  reconnectAt: number | null;
  onLeave: () => void;
  onJoinWithToken: (tokenOrUrl: string) => boolean;
  onDismissError: () => void;
}

export function SessionPanel({
  status,
  identityToken,
  error,
  memberName,
  memberRole,
  reconnectAttempt,
  reconnectAt,
  onLeave,
  onJoinWithToken,
  onDismissError,
}: SessionPanelProps) {
  const countdown = useCountdown(reconnectAt);
  const { copied: tokenCopied, copy: copyToken } = useCopyFeedback(1500);
  const [inputCode, setInputCode] = useState('');
  const [badPaste, setBadPaste] = useState(false);
  const autoTriggeredRef = useRef<string | null>(null);
  const badPasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const active = connected || connecting;
  const hasDroppedToken = status === 'disconnected' && identityToken !== null;

  function showBadPaste() {
    if (badPasteTimerRef.current) clearTimeout(badPasteTimerRef.current);
    setBadPaste(true);
    badPasteTimerRef.current = setTimeout(() => { setBadPaste(false); badPasteTimerRef.current = null; }, 2500);
  }

  function clearBadPaste() {
    if (badPasteTimerRef.current) { clearTimeout(badPasteTimerRef.current); badPasteTimerRef.current = null; }
    setBadPaste(false);
  }

  function handleInput(raw: string) {
    // Clear server error and reset auto-join guard on every keystroke.
    onDismissError();
    autoTriggeredRef.current = null;

    // If it looks like a URL with #identity=TOKEN, extract just the token fragment.
    // Otherwise show the raw input uppercased — no stripping, so the user sees
    // exactly what they typed and gets clear feedback on invalid characters.
    let value = raw.trim().toUpperCase();
    try {
      const url = new URL(raw.trim());
      const m = url.hash.match(/^#identity=([A-Za-z0-9]+)$/);
      if (m) value = m[1].toUpperCase();
    } catch { /* not a URL */ }

    if (value.length > 12) {
      // Paste was too long — truncate and flag it.
      setInputCode(value.slice(0, 12));
      showBadPaste();
    } else if (value.length === 12 && !VALID_TOKEN_RE.test(value)) {
      // Exactly 12 chars but contains illegal characters (0, 1, I, O, etc.).
      setInputCode(value);
      showBadPaste();
    } else {
      setInputCode(value);
      clearBadPaste();
    }
  }

  function handleJoin() {
    onJoinWithToken(inputCode.trim());
  }

  function handleLeave() {
    setInputCode('');
    autoTriggeredRef.current = null;
    onLeave();
  }

  // Restore focus to the input when a server error arrives. Focus is lost because
  // auth failure causes a branch swap (connected UI → disconnected UI), mounting
  // a fresh input element. badPaste is suppressed in render when error is set,
  // so no setState call is needed here.
  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error]);

  // Auto-join when a valid 12-char token is entered — no button click required.
  // Mirrors the dashboard's SessionBrowserView auto-submit pattern.
  useEffect(() => {
    if (active) return;
    const token = inputCode.trim();
    if (VALID_TOKEN_RE.test(token) && autoTriggeredRef.current !== token) {
      autoTriggeredRef.current = token;
      const timer = setTimeout(() => { handleJoin(); }, 100);
      return () => clearTimeout(timer);
    }
  }, [inputCode]);

  const statusDotClass =
    status === 'connected' ? 'bg-success' :
    status === 'connecting' ? 'bg-warning animate-[pulse-dot_1s_infinite]' :
    'bg-muted-foreground';

  // ── Connected state ───────────────────────────────────────────────────────
  if (connected) {
    return (
      <section className="px-3 py-2">
        {/* Row 1: status + actions */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${statusDotClass}`} />
            <span className="truncate">
              {memberName && <span className="text-foreground/70 ml-1">{memberName}</span>}
              {memberRole && memberRole !== 'scout' && <span className="text-warning ml-0.5">({memberRole})</span>}
            </span>
            {identityToken && (
              <button
                onClick={() => copyToken(buildIdentityUrl(identityToken, '/'))}
                className="shrink-0 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                title="Copy identity link"
              >
                {tokenCopied
                  ? <Check className="w-3 h-3 text-success" />
                  : <Copy className="w-3 h-3" />
                }
              </button>
            )}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleLeave}
              className="bg-transparent text-muted-foreground text-xs font-semibold px-2 py-1 rounded border border-border hover:bg-secondary hover:text-foreground"
            >
              Leave
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Disconnected with a dropped invite token (reconnect UI) ───────────────
  if (hasDroppedToken) {
    const redacted = '••••••••' + identityToken!.slice(-4);
    return (
      <section className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="flex-1 bg-input border border-border rounded px-2 py-1 text-muted-foreground text-sm font-mono tracking-wider select-none">
            {redacted}
          </span>
          <button
            onClick={() => onJoinWithToken(identityToken!)}
            className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded hover:opacity-90"
          >
            Reconnect
          </button>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${statusDotClass}`} />
            <span>Disconnected</span>
          </span>
          <button
            onClick={handleLeave}
            className="bg-transparent text-muted-foreground text-[11px] px-1 hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </section>
    );
  }

  // ── Connecting / Disconnected state ─────────────────────────────────────────
  return (
    <section className="px-3 py-2">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Invite code"
          autoComplete="off"
          spellCheck={false}
          value={inputCode}
          ref={inputRef}
          onChange={(e) => handleInput(e.target.value)}
          disabled={active}
          className="flex-1 bg-input border border-border rounded px-2 py-1 text-foreground text-sm font-semibold uppercase tracking-wider focus:outline-none focus:border-primary placeholder:text-muted-foreground placeholder:text-xs placeholder:tracking-normal placeholder:font-normal"
        />
      </div>
      {badPaste && !error && <p className="text-[11px] text-destructive mt-1">Not a valid code or link</p>}
      {error && (
        <button
          onClick={onDismissError}
          className="text-[11px] text-destructive mt-1 hover:opacity-70 transition-opacity text-left"
          title={`${error} (click to dismiss)`}
        >
          {error}
        </button>
      )}
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${statusDotClass}`} />
          <span>{(connecting && formatReconnectMessage(reconnectAttempt, countdown)) || (connecting ? 'Connecting…' : 'Disconnected')}</span>
        </span>
        {connecting && (
          <button
            onClick={handleLeave}
            className="bg-transparent text-muted-foreground text-xs font-semibold px-2.5 py-1 rounded border border-border hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
