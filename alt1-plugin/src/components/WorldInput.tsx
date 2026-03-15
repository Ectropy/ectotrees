import { ScanLine, ScanEye, EyeClosed, Eye } from 'lucide-react';
import { Tooltip } from './ui/tooltip';

interface WorldInputProps {
  world: string;
  hasPixel: boolean;
  hasGameState: boolean;
  autoWorld: boolean;
  isWorldScanning: boolean;
  onChange: (value: string) => void;
  onScan: () => void;
  onAutoWorldToggle: () => void;
}

export function WorldInput({
  world,
  hasPixel,
  hasGameState,
  autoWorld,
  isWorldScanning,
  onChange,
  onScan,
  onAutoWorldToggle,
}: WorldInputProps) {
  return (
    <section className="px-3 py-2">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
        World
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          placeholder="e.g. 4"
          value={world}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[90px] text-center bg-input border border-border rounded px-2 py-1 text-foreground text-[13px] focus:outline-none focus:border-primary placeholder:text-muted-foreground"
        />
        <Tooltip content={hasPixel || hasGameState ? 'Scan for current world' : 'Pixel/gamestate permission required'} side="top">
          <button
            onClick={onScan}
            disabled={!hasPixel && !hasGameState}
            aria-label="Auto-detect world"
            className="flex items-center justify-center w-7 h-7 bg-secondary border border-primary rounded text-primary disabled:border-border disabled:text-muted-foreground disabled:cursor-not-allowed hover:enabled:bg-primary/10 transition-colors"
          >
            <ScanLine size={14} />
          </button>
        </Tooltip>
        <Tooltip
          content={autoWorld ? 'Disable current world auto-detect' : 'Enable current world auto-detect'}
          side="top"
        >
          <button
            onClick={onAutoWorldToggle}
            disabled={!hasGameState}
            aria-label="Toggle auto world detection"
            className={`flex items-center justify-center w-7 h-7 shrink-0 rounded transition-colors ${
              autoWorld
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary border border-primary text-primary hover:enabled:bg-primary/10'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {!autoWorld ? <ScanEye size={14} /> : isWorldScanning ? <Eye size={14} /> : <EyeClosed size={14} />}
          </button>
        </Tooltip>
      </div>
    </section>
  );
}
