import { useState } from 'react';

interface LinkPanelProps {
  isPaired: boolean;
  pairId: string | null;
  sessionCode: string | null;
  onSubmitToken: (token: string) => void;
  onUnpair: () => void;
}

export function LinkPanel({ isPaired, pairId: _pairId, sessionCode, onSubmitToken, onUnpair }: LinkPanelProps) {
  const [token, setToken] = useState('');

  function handleInput(raw: string) {
    // Only accept the valid pair token alphabet, max 4 chars
    const cleaned = raw.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 4);
    setToken(cleaned);
  }

  function handleSubmit() {
    const t = token.trim();
    if (!/^[A-HJ-NP-Z2-9]{4}$/.test(t)) return;
    onSubmitToken(t);
    setToken('');
  }

  if (isPaired) {
    return (
      <section className="px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="text-warning">⚡</span>
            <span>
              Paired
              {sessionCode && (
                <span className="text-muted-foreground/60"> · {sessionCode}</span>
              )}
            </span>
          </span>
          <button
            onClick={onUnpair}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Unpair
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="px-3 py-2">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
      >
        <input
          type="text"
          maxLength={4}
          placeholder="Pair code"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => handleInput(e.target.value)}
          className="flex-1 max-w-[90px] bg-input border border-border rounded px-2 py-1 text-foreground text-sm font-semibold uppercase tracking-widest focus:outline-none focus:border-primary placeholder:text-muted-foreground placeholder:tracking-normal placeholder:font-normal"
        />
        <button
          type="submit"
          disabled={!/^[A-HJ-NP-Z2-9]{4}$/.test(token)}
          className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
        >
          Link
        </button>
      </form>
      <p className="text-[10px] text-muted-foreground mt-1">
        Enter the 4-char code from the dashboard to pair.
      </p>
    </section>
  );
}
