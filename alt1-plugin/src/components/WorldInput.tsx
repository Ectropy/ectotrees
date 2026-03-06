interface WorldInputProps {
  world: string;
  autoDetected: boolean;
  hasPixel: boolean;
  onChange: (value: string) => void;
  onScan: () => void;
}

export function WorldInput({
  world,
  autoDetected,
  hasPixel,
  onChange,
  onScan,
}: WorldInputProps) {
  return (
    <section className="px-3 py-2.5">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
        World
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={137}
          placeholder="e.g. 4"
          value={world}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[90px] text-center bg-input border border-border rounded px-2 py-1 text-foreground text-[13px] focus:outline-none focus:border-primary placeholder:text-muted-foreground"
        />
        <button
          onClick={onScan}
          disabled={!hasPixel}
          className="bg-secondary text-foreground text-xs font-semibold px-2.5 py-1 rounded border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-border"
        >
          Scan
        </button>
        {autoDetected && (
          <span className="text-[11px] text-muted-foreground italic">auto-detected</span>
        )}
      </div>
    </section>
  );
}
