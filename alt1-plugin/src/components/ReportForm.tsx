interface ReportFormProps {
  hours: string;
  minutes: string;
  hint: string;
  scanStatus: string;
  scanStatusKind: 'ok' | 'warn' | 'error' | '';
  hasPixel: boolean;
  canSubmit: boolean;
  onHoursChange: (v: string) => void;
  onMinutesChange: (v: string) => void;
  onHintChange: (v: string) => void;
  onScanDialog: () => void;
  onSubmit: () => void;
  onClear: () => void;
}

export function ReportForm({
  hours,
  minutes,
  hint,
  scanStatus,
  scanStatusKind,
  hasPixel,
  canSubmit,
  onHoursChange,
  onMinutesChange,
  onHintChange,
  onScanDialog,
  onSubmit,
  onClear,
}: ReportFormProps) {
  const scanStatusColors = {
    ok: 'text-success',
    warn: 'text-warning',
    error: 'text-destructive',
    '': 'text-muted-foreground',
  };

  return (
    <section className="px-3 py-2.5">
      {/* Spawn timer */}
      <div className="flex flex-col">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Time until spawn
        </label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={1}
            placeholder="0"
            value={hours}
            onChange={(e) => onHoursChange(e.target.value)}
            className="max-w-[60px] text-center bg-input border border-border rounded px-2 py-1 text-foreground text-base font-semibold focus:outline-none focus:border-primary placeholder:text-muted-foreground"
          />
          <span className="text-xs text-muted-foreground shrink-0">hr</span>
          <input
            type="number"
            min={0}
            max={59}
            placeholder="0"
            value={minutes}
            onChange={(e) => onMinutesChange(e.target.value)}
            className="max-w-[60px] text-center bg-input border border-border rounded px-2 py-1 text-foreground text-base font-semibold focus:outline-none focus:border-primary placeholder:text-muted-foreground"
          />
          <span className="text-xs text-muted-foreground shrink-0">min</span>
        </div>
      </div>

      {/* Hint */}
      <div className="flex flex-col mt-2">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Location hint
        </label>
        <input
          type="text"
          maxLength={200}
          placeholder="e.g. in the lands inhabited by elves"
          value={hint}
          onChange={(e) => onHintChange(e.target.value)}
          className="bg-input border border-border rounded px-2 py-1 text-foreground text-xs focus:outline-none focus:border-primary placeholder:text-muted-foreground"
        />
      </div>

      {/* Scan button */}
      <button
        onClick={onScanDialog}
        disabled={!hasPixel}
        className="mt-2.5 w-full bg-secondary text-primary border border-primary rounded py-[7px] text-xs font-semibold disabled:border-border disabled:text-muted-foreground disabled:cursor-not-allowed hover:enabled:bg-primary/10"
      >
        Scan Spirit Tree Dialog
      </button>

      {/* Scan status */}
      {scanStatus && (
        <div className={`mt-1.5 text-[11px] min-h-[16px] ${scanStatusColors[scanStatusKind]}`}>
          {scanStatus}
        </div>
      )}

      {/* Divider */}
      <hr className="border-t border-border my-2.5" />

      {/* Submit / Clear */}
      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex-1 bg-success text-white py-2 rounded text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-90"
        >
          Submit
        </button>
        <button
          onClick={onClear}
          className="bg-transparent text-muted-foreground text-xs font-semibold px-2.5 py-1 rounded border border-border hover:bg-secondary hover:text-foreground"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
