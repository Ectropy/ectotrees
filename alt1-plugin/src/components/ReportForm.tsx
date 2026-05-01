import { ScanText, ScanEye, EyeClosed, Eye, Cloud, CloudOff, CloudUpload, CloudCheck } from 'lucide-react';
import { LOCATION_HINTS } from '@shared/hints';
import { SPAWN_COLOR } from '../../../src/constants/toolColors';
import { Tooltip } from './ui/tooltip';
import { SelectCombobox } from './ui/combobox';

const HINT_OPTIONS = LOCATION_HINTS.map(lh => lh.hint).sort();

interface ReportFormProps {
  hours: string;
  minutes: string;
  hint: string;
  statusMsg: string;
  statusKind: 'ok' | 'warn' | 'error' | '';
  hasPixel: boolean;
  canSubmit: boolean;
  autoScan: boolean;
  isScanning: boolean;
  autoSubmit: boolean;
  autoCountdown: number | null;
  cloudCheck: boolean;
  blinkFrame: boolean;
  onHoursChange: (v: string) => void;
  onMinutesChange: (v: string) => void;
  onHintChange: (v: string) => void;
  onScanDialog: () => void;
  onAutoScanToggle: () => void;
  onAutoSubmitToggle: () => void;
  onSubmit: () => void;
  onClear: () => void;
}

export function ReportForm({
  hours,
  minutes,
  hint,
  statusMsg,
  statusKind,
  hasPixel,
  canSubmit,
  autoScan,
  isScanning,
  autoSubmit,
  autoCountdown,
  cloudCheck,
  blinkFrame,
  onHoursChange,
  onMinutesChange,
  onHintChange,
  onScanDialog,
  onAutoScanToggle,
  onAutoSubmitToggle,
  onSubmit,
  onClear,
}: ReportFormProps) {
  const statusColors = {
    ok: 'text-success',
    warn: 'text-warning',
    error: 'text-destructive',
    '': 'text-muted-foreground',
  };

  return (
    <section className="px-3 py-2">
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

      {/* Hint with inline scan icon */}
      <div className="flex flex-col mt-2">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Location hint
        </label>
        <div className="flex items-center gap-1.5">
          <SelectCombobox
            items={HINT_OPTIONS}
            value={hint || null}
            onValueChange={(v) => onHintChange(v ?? '')}
            placeholder="Select or type a location hint"
            className="flex-1"
          />
          <Tooltip
            content={hasPixel ? 'Scan dialogs for intel' : 'Pixel permission required to scan'}
            side="top"
          >
            <button
              onClick={onScanDialog}
              disabled={!hasPixel}
              aria-label="Scan Spirit Tree dialog"
              className="flex items-center justify-center w-7 h-7 shrink-0 bg-secondary border border-primary rounded text-primary disabled:border-border disabled:text-muted-foreground disabled:cursor-not-allowed hover:enabled:bg-primary/10 transition-colors"
            >
              <ScanText size={14} />
            </button>
          </Tooltip>
          <Tooltip
            content={autoScan ? 'Disable intel auto-detect' : 'Enable intel auto-detect'}
            side="top"
          >
            <button
              onClick={onAutoScanToggle}
              disabled={!hasPixel}
              aria-label="Toggle auto-scan"
              className={`flex items-center justify-center w-7 h-7 shrink-0 rounded transition-colors ${
                autoScan
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary border border-primary text-primary hover:enabled:bg-primary/10'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {!autoScan ? <ScanEye size={14} /> : isScanning ? <Eye size={14} /> : <EyeClosed size={14} />}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Status line — always rendered to reserve height and prevent reflow */}
      <div className={`mt-1.5 text-[11px] min-h-[16px] ${statusColors[statusKind]}`}>
        {statusMsg}
      </div>

      {/* Divider */}
      <hr className="border-t border-border my-2" />

      {/* Submit / Clear */}
      <div className="flex gap-2">
        <div className={`flex flex-1 rounded overflow-hidden ${SPAWN_COLOR.border}`}>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className={`flex-1 bg-transparent ${SPAWN_COLOR.label} py-2 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-300-a20 transition-colors`}
          >
            {autoCountdown !== null ? `Submit (${autoCountdown}s)` : 'Submit'}
          </button>
          <div className="w-px bg-blue-300-a50 self-stretch" />
          <Tooltip
            content={
              cloudCheck
                ? 'Submitted!'
                : autoCountdown !== null
                ? `Submitting in ${autoCountdown}s — click to cancel`
                : autoSubmit
                ? 'Click to disable auto-submit.'
                : 'Click to enable auto-submit. Submits 10s after all fields are filled.'
            }
            side="top"
          >
            <button
              onClick={onAutoSubmitToggle}
              aria-label="Toggle auto-submit"
              className={`flex items-center justify-center px-2.5 ${SPAWN_COLOR.text} hover:opacity-90 transition-all ${autoSubmit || cloudCheck ? 'bg-blue-300-a25' : 'opacity-40'}`}
            >
              {cloudCheck ? (
                <CloudCheck size={14} />
              ) : autoCountdown !== null ? (
                blinkFrame ? <CloudUpload size={14} /> : <Cloud size={14} />
              ) : autoSubmit ? (
                <Cloud size={14} />
              ) : (
                <CloudOff size={14} />
              )}
            </button>
          </Tooltip>
        </div>
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
