import { Skull, Cloud, CloudOff, CloudUpload, CloudCheck } from 'lucide-react';
import { LOCATION_HINTS } from '@shared/hints';
import { DEAD_COLOR } from '../../../src/constants/toolColors';
import { Tooltip } from './ui/tooltip';
import { SelectCombobox } from './ui/combobox';

const HINT_OPTIONS = LOCATION_HINTS.map(lh => lh.hint).sort();

interface DeadFormProps {
  statusMsg: string;
  statusKind: 'ok' | 'warn' | 'error' | '';
  canSubmit: boolean;
  hint: string;
  exactLocation: string;
  autoSubmit: boolean;
  autoCountdown: number | null;
  cloudCheck: boolean;
  blinkFrame: boolean;
  onHintChange: (v: string) => void;
  onAutoSubmitToggle: () => void;
  onSubmit: () => void;
  onClear: () => void;
}

const statusColors = {
  ok: 'text-success',
  warn: 'text-warning',
  error: 'text-destructive',
  '': 'text-muted-foreground',
};

export function DeadForm({
  statusMsg, statusKind, canSubmit,
  hint, exactLocation,
  autoSubmit, autoCountdown, cloudCheck, blinkFrame,
  onHintChange,
  onAutoSubmitToggle, onSubmit, onClear,
}: DeadFormProps) {
  return (
    <section className="px-3 py-2">
      <p className="text-[11px] text-muted-foreground mb-3">
        Marks this world&apos;s tree as dead and starts the 10-minute fallen tree reward window.
      </p>

      <div className="flex flex-col mb-2">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Location hint
        </label>
        <SelectCombobox
          items={HINT_OPTIONS}
          value={hint || null}
          onValueChange={(v) => onHintChange(v ?? '')}
          placeholder="Select or type a location hint"
        />
      </div>

      {exactLocation && (
        <div className="mb-2 text-[11px] text-muted-foreground truncate">
          <span className="text-foreground/60">Location:</span> {exactLocation}
        </div>
      )}

      <div className={`mb-2 text-[11px] min-h-[16px] ${statusColors[statusKind]}`}>
        {statusMsg}
      </div>

      <hr className="border-t border-border my-2" />

      <div className="flex gap-2">
        <div className={`flex flex-1 rounded overflow-hidden ${DEAD_COLOR.border}`}>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className={`flex-1 flex items-center justify-center gap-1.5 bg-transparent ${DEAD_COLOR.label} py-2 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-500-a20 transition-colors`}
          >
            <Skull size={13} />
            {autoCountdown !== null ? `Mark Dead (${autoCountdown}s)` : 'Mark Dead'}
          </button>
          <div className="w-px bg-red-500-a50 self-stretch" />
          <Tooltip
            content={
              cloudCheck
                ? 'Marked dead!'
                : autoCountdown !== null
                ? `Submitting in ${autoCountdown}s — click to cancel`
                : autoSubmit
                ? 'Click to disable auto-submit.'
                : 'Click to enable auto-submit. Submits 10s after dead is detected.'
            }
            side="top"
          >
            <button
              onClick={onAutoSubmitToggle}
              aria-label="Toggle auto-submit"
              className={`flex items-center justify-center px-2.5 ${DEAD_COLOR.text} hover:opacity-90 transition-all ${autoSubmit || cloudCheck ? 'bg-red-500-a25' : 'opacity-40'}`}
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
