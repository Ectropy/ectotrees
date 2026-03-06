import { useState } from 'react';
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
  onJoin: (code: string) => boolean;
  onCreate: () => Promise<string | null>;
  onLeave: () => void;
  onError: (msg: string) => void;
}

export function SessionPanel({
  status,
  code,
  clientCount,
  onJoin,
  onCreate,
  onLeave,
  onError,
}: SessionPanelProps) {
  const [inputCode, setInputCode] = useState(code ?? '');
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

  // Sync code from session into input when it changes externally
  if (code && !inputCode) {
    setInputCode(code);
  }

  const statusDotClass =
    status === 'connected' ? 'bg-success' :
    status === 'connecting' ? 'bg-warning animate-[pulse-dot_1s_infinite]' :
    'bg-muted-foreground';

  const statusLabel = connected
    ? `${code} · ${clientCount} member${clientCount !== 1 ? 's' : ''}`
    : connecting
    ? 'Connecting...'
    : 'Disconnected';

  return (
    <section className="px-3 py-2.5">
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
          <span>{statusLabel}</span>
        </span>
        {active && (
          <button
            onClick={onLeave}
            className="bg-transparent text-muted-foreground text-xs font-semibold px-2.5 py-1 rounded border border-border hover:bg-secondary hover:text-foreground"
          >
            Leave
          </button>
        )}
      </div>
    </section>
  );
}
