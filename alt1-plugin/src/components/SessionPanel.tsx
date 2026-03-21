import { useState } from 'react';
import type { SessionStatus } from '../session';

function extractSessionCode(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const hashMatch = url.hash.match(/^#join=(.+)$/);
    if (hashMatch) return hashMatch[1].toUpperCase();
  } catch { /* not a URL */ }
  return raw.toUpperCase();
}

interface SessionPanelProps {
  status: SessionStatus;
  code: string | null;
  memberName: string | null;
  memberRole: string | null;
  onJoin: (code: string) => boolean;
  onLeave: () => void;
  onJoinWithToken: (tokenOrUrl: string) => boolean;
  onError: (msg: string) => void;
}

export function SessionPanel({
  status,
  code,
  memberName,
  memberRole,
  onJoin,
  onLeave,
  onJoinWithToken,
  onError,
}: SessionPanelProps) {
  const [inputCode, setInputCode] = useState(code ?? '');
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const active = connected || connecting;

  function handleInput(raw: string) {
    // If the input is a URL with any recognized fragment (#join=, #invite=, etc.),
    // extract just the code/token from it rather than showing the whole URL.
    try {
      const url = new URL(raw.trim());
      const hashMatch = url.hash.match(/^#(?:join|invite|personal)=([A-Za-z0-9]+)$/);
      if (hashMatch) {
        setInputCode(hashMatch[1].toUpperCase());
        return;
      }
    } catch { /* not a URL */ }
    setInputCode(raw.toUpperCase());
  }

  function handleJoin() {
    const raw = inputCode.trim();
    // Try as 12-char invite token or URL with #invite=
    if (onJoinWithToken(raw)) {
      setInputCode('');
      return;
    }
    // Fall back to 6-char session code
    const c = extractSessionCode(raw);
    if (!/^[A-Z2-9]{6}$/.test(c)) {
      onError('Enter a 6-char session code or 12-char invite code.');
      return;
    }
    setInputCode(c);
    onJoin(c);
  }

  // Sync code from session into input when it changes externally
  if (code && !inputCode) {
    setInputCode(code);
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
              onClick={onLeave}
              className="bg-transparent text-muted-foreground text-xs font-semibold px-2 py-1 rounded border border-border hover:bg-secondary hover:text-foreground"
            >
              Leave
            </button>
          </div>
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
          placeholder="Session or invite code"
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
            onClick={onLeave}
            className="bg-transparent text-muted-foreground text-xs font-semibold px-2.5 py-1 rounded border border-border hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
