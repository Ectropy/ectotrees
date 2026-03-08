import { useState } from 'react';
import { Link2 } from 'lucide-react';
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
  isPaired: boolean;
  onJoin: (code: string) => boolean;
  onCreate: () => Promise<string | null>;
  onLeave: () => void;
  onSubmitPairToken: (token: string) => void;
  onUnpair: () => void;
  onError: (msg: string) => void;
}

export function SessionPanel({
  status,
  code,
  clientCount,
  isPaired,
  onJoin,
  onCreate,
  onLeave,
  onSubmitPairToken,
  onUnpair,
  onError,
}: SessionPanelProps) {
  const [inputCode, setInputCode] = useState(code ?? '');
  const [pairToken, setPairToken] = useState('');
  const [busy, setBusy] = useState(false);
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const active = connected || connecting;

  function handleInput(raw: string) {
    const extracted = extractSessionCode(raw);
    if (extracted.length > 6) {
      setInputCode('');
      onError('Not a valid code or link.');
    } else if (extracted !== raw.toUpperCase()) {
      setInputCode(extracted);
    } else {
      setInputCode(raw.toUpperCase());
    }
  }

  function handleJoin() {
    const c = extractSessionCode(inputCode);
    if (!/^[A-Z2-9]{6}$/.test(c)) {
      onError('Enter a valid 6-character session code.');
      return;
    }
    setInputCode(c);
    onJoin(c);
  }

  async function handleCreate() {
    setBusy(true);
    const c = await onCreate();
    if (c) setInputCode(c);
    setBusy(false);
  }

  function handlePairInput(raw: string) {
    const cleaned = raw.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 4);
    setPairToken(cleaned);
  }

  function handlePairSubmit() {
    const t = pairToken.trim();
    if (!/^[A-HJ-NP-Z2-9]{4}$/.test(t)) return;
    onSubmitPairToken(t);
    setPairToken('');
  }

  // Sync code from session into input when it changes externally
  if (code && !inputCode) {
    setInputCode(code);
  }

  const statusDotClass =
    status === 'connected' ? 'bg-success' :
    status === 'connecting' ? 'bg-warning animate-[pulse-dot_1s_infinite]' :
    'bg-muted-foreground';

  // ── Connected state: compact single row ─────────────────────────────────────
  if (connected) {
    return (
      <section className="px-3 py-2">
        {/* Row 1: status + actions */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${statusDotClass}`} />
            <span className="truncate">
              {code}
              {isPaired && <span className="text-warning ml-1">⚡</span>}
              <span className="text-muted-foreground/60"> · {clientCount} member{clientCount !== 1 ? 's' : ''}</span>
            </span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPaired && (
              <button
                onClick={onUnpair}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Unpair
              </button>
            )}
            <button
              onClick={onLeave}
              className="bg-transparent text-muted-foreground text-xs font-semibold px-2 py-1 rounded border border-border hover:bg-secondary hover:text-foreground"
            >
              Leave
            </button>
          </div>
        </div>

        {/* Row 2: pair token input (only when not yet paired) */}
        {!isPaired && (
          <form
            className="flex items-center gap-1.5 mt-1.5"
            onSubmit={(e) => { e.preventDefault(); handlePairSubmit(); }}
          >
            <input
              type="text"
              maxLength={4}
              placeholder="Pair code"
              autoComplete="off"
              spellCheck={false}
              value={pairToken}
              onChange={(e) => handlePairInput(e.target.value)}
              className="flex-1 max-w-[90px] bg-input border border-border rounded px-2 py-1 text-foreground text-sm font-semibold uppercase tracking-widest focus:outline-none focus:border-primary placeholder:text-muted-foreground placeholder:tracking-normal placeholder:font-normal"
            />
            <Tooltip content="Enter the 4-char pair code shown on the dashboard" side="top">
              <button
                type="submit"
                disabled={!/^[A-HJ-NP-Z2-9]{4}$/.test(pairToken)}
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
          placeholder="Code"
          autoComplete="off"
          spellCheck={false}
          value={inputCode}
          onChange={(e) => handleInput(e.target.value)}
          disabled={active}
          className="flex-1 max-w-[120px] bg-input border border-border rounded px-2 py-1 text-foreground text-sm font-semibold uppercase tracking-wider focus:outline-none focus:border-primary placeholder:text-muted-foreground"
        />
        <button
          onClick={handleJoin}
          disabled={active || busy}
          className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        >
          Join
        </button>
        <button
          onClick={handleCreate}
          disabled={active || busy}
          className="bg-secondary text-foreground text-xs font-semibold px-2.5 py-1 rounded border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-border"
        >
          New
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
