import { useState } from 'react';
import { Link2, Check, Copy } from 'lucide-react';
import { Tooltip } from './ui/tooltip';
import type { SessionStatus } from '../session';

function extractSessionCode(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const param = url.searchParams.get('join');
    if (param) return param.toUpperCase();
  } catch { /* not a URL */ }
  return raw.toUpperCase();
}

interface SessionPanelProps {
  status: SessionStatus;
  code: string | null;
  clientCount: number;
  inviteToken: string | null;
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
  clientCount,
  inviteToken,
  memberName,
  memberRole,
  onJoin,
  onLeave,
  onJoinWithToken,
  onError,
}: SessionPanelProps) {
  const [inputCode, setInputCode] = useState(code ?? '');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const active = connected || connecting;

  function handleInput(raw: string) {
    // Accept both 6-char session codes and 12-char invite tokens
    const upper = raw.toUpperCase();
    // Try extracting a session code from a URL
    const extracted = extractSessionCode(raw);
    if (extracted !== upper && extracted.length <= 12) {
      setInputCode(extracted);
    } else {
      setInputCode(upper);
    }
  }

  function handleJoin() {
    const raw = inputCode.trim();
    // Try as 12-char invite token or URL with ?invite=
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

  function handleTokenInput(raw: string) {
    // Allow pasting full URLs or bare tokens
    setTokenInput(raw);
  }

  function handleTokenSubmit() {
    const t = tokenInput.trim();
    if (!t) return;
    if (onJoinWithToken(t)) {
      setTokenInput('');
    }
  }

  async function handleCopyToken() {
    if (!inviteToken) return;
    try {
      await navigator.clipboard.writeText(inviteToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch { /* ignore */ }
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
              {code}
              {memberName && <span className="text-foreground/70 ml-1">· {memberName}</span>}
              {memberRole && memberRole !== 'scout' && <span className="text-warning ml-0.5">({memberRole})</span>}
              <span className="text-muted-foreground/60"> · {clientCount} member{clientCount !== 1 ? 's' : ''}</span>
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

        {/* Row 2: invite token display or input */}
        {inviteToken ? (
          <div className="flex items-center gap-1.5 mt-1.5">
            <Link2 size={12} className="text-success shrink-0" />
            <span className="text-[11px] text-muted-foreground">Code:</span>
            <button
              onClick={handleCopyToken}
              className="font-mono font-bold text-warning text-xs tracking-widest hover:text-warning/80 transition-colors"
              title="Copy your code"
            >
              {inviteToken}
            </button>
            {tokenCopied ? (
              <Check size={12} className="text-success" />
            ) : (
              <button onClick={handleCopyToken} className="text-muted-foreground hover:text-foreground transition-colors" title="Copy">
                <Copy size={12} />
              </button>
            )}
          </div>
        ) : (
          <form
            className="flex items-center gap-1.5 mt-1.5"
            onSubmit={(e) => { e.preventDefault(); handleTokenSubmit(); }}
          >
            <input
              type="text"
              maxLength={256}
              placeholder="Enter your code"
              autoComplete="off"
              spellCheck={false}
              value={tokenInput}
              onChange={(e) => handleTokenInput(e.target.value)}
              className="flex-1 bg-input border border-border rounded px-2 py-1 text-foreground text-sm font-semibold uppercase tracking-widest focus:outline-none focus:border-primary placeholder:text-muted-foreground placeholder:tracking-normal placeholder:font-normal"
            />
            <Tooltip content="Enter the code shown on the dashboard to link this scout" side="top">
              <button
                type="submit"
                disabled={!tokenInput.trim()}
                className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-semibold px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              >
                <Link2 size={12} />
                Link
              </button>
            </Tooltip>
          </form>
        )}
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
