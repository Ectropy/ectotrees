import { LOCATION_HINTS } from '@shared/hints';
import { SPAWN_COLOR } from '@shared-browser/toolColors';
import { SelectCombobox } from './ui/combobox';
import { StatusLine } from './StatusLine';
import { ScanButtons } from './ScanButtons';
import { SubmitBar } from './SubmitBar';

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
          <ScanButtons
            hasPixel={hasPixel}
            autoScan={autoScan}
            isScanning={isScanning}
            onScanDialog={onScanDialog}
            onAutoScanToggle={onAutoScanToggle}
          />
        </div>
      </div>

      <StatusLine statusMsg={statusMsg} statusKind={statusKind} />

      {/* Divider */}
      <hr className="border-t border-border my-2" />

      {/* Submit / Clear */}
      <SubmitBar
        canSubmit={canSubmit}
        autoSubmit={autoSubmit}
        autoCountdown={autoCountdown}
        cloudCheck={cloudCheck}
        blinkFrame={blinkFrame}
        onSubmit={onSubmit}
        onAutoSubmitToggle={onAutoSubmitToggle}
        onClear={onClear}
        submitLabel="Submit"
        submittedTooltip="Submitted!"
        autoSubmitHint="Click to enable auto-submit. Submits 10s after all fields are filled."
        borderClass={SPAWN_COLOR.border}
        labelClass={SPAWN_COLOR.label}
        textClass={SPAWN_COLOR.text}
        hoverBgClass="hover:bg-blue-300-a20"
        dividerBgClass="bg-blue-300-a50"
        activeBgClass="bg-blue-300-a25"
      />
    </section>
  );
}
