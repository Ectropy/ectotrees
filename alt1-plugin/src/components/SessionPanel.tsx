import { useState } from 'react';
import type { SessionStatus } from '../session';

interface SessionPanelProps {
  status: SessionStatus;
  code: string | null;
  inviteToken: string | null;
  memberName: string | null;
  memberRole: string | null;
  onLeave: () => void;
  onJoinWithToken: (tokenOrUrl: string) => boolean;
  onError: (msg: string) => void;
}

export function SessionPanel({
  status,
  inviteToken,
  memberName,
  memberRole,
  onLeave,
  onJoinWithToken,
  onError,
}: SessionPanelProps) {
  const [inputCode, setInputCode] = useState('');
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const active = connected || connecting;
  const hasDroppedToken = status === 'disconnected' && inviteToken !== null;

  function handleInput(raw: string) {
    // If the input is a URL with a recognized fragment (#invite=, #personal=),
    // extract just the token from it rather than showing the whole URL.
    try {
      const url = new URL(raw.trim());
      const hashMatch = url.hash.match(/^#(?:invite|personal)=([A-Za-z0-9]+)$/);
      if (hashMatch) {
        setInputCode(hashMatch[1].toUpperCase());
        return;
      }
    } catch { /* not a URL */ }
    setInputCode(raw.toUpperCase());
  }

  function handleJoin() {
    const raw = inputCode.trim();
    if (!onJoinWithToken(raw)) {
      onError('Enter a valid 12-char invite code or invite URL.');
      return;
    }
    setInputCode('');
  }

  function handleLeave() {
    setInputCode('');
    onLeave();
  }

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
    const redacted = '••••••••' + inviteToken!.slice(-4);
    return (
      <section className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="flex-1 bg-input border border-border rounded px-2 py-1 text-muted-foreground text-sm font-mono tracking-wider select-none">
            {redacted}
          </span>
          <button
            onClick={() => onJoinWithToken(inviteToken!)}
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
          maxLength={256}
          placeholder="Invite code"
          autoComplete="off"
          spellCheck={false}
          value={inputCode}
          onChange={(e) => handleInput(e.target.value)}
          disabled={active}
          className="flex-1 bg-input border border-border rounded px-2 py-1 text-foreground text-sm font-semibold uppercase tracking-wider focus:outline-none focus:border-primary placeholder:text-muted-foreground placeholder:text-xs placeholder:tracking-normal placeholder:font-normal"
        />
        <button
          onClick={handleJoin}
          disabled={active}
          className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        >
          Join
        </button>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${statusDotClass}`} />
          <span>{connecting ? 'Connecting...' : 'Disconnected'}</span>
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
