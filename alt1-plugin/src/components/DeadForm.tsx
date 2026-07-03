import { Skull } from 'lucide-react';
import { LOCATION_HINTS } from '@shared/hints';
import { DEAD_COLOR } from '../../../src/constants/toolColors';
import { SelectCombobox } from './ui/combobox';
import { StatusLine } from './StatusLine';
import { SubmitBar } from './SubmitBar';

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

      <StatusLine statusMsg={statusMsg} statusKind={statusKind} marginClass="mb-2" />

      <hr className="border-t border-border my-2" />

      <SubmitBar
        canSubmit={canSubmit}
        autoSubmit={autoSubmit}
        autoCountdown={autoCountdown}
        cloudCheck={cloudCheck}
        blinkFrame={blinkFrame}
        onSubmit={onSubmit}
        onAutoSubmitToggle={onAutoSubmitToggle}
        onClear={onClear}
        submitLabel="Mark Dead"
        submitIcon={<Skull size={13} />}
        submittedTooltip="Marked dead!"
        autoSubmitHint="Click to enable auto-submit. Submits 10s after dead is detected."
        borderClass={DEAD_COLOR.border}
        labelClass={DEAD_COLOR.label}
        textClass={DEAD_COLOR.text}
        hoverBgClass="hover:bg-red-500-a20"
        dividerBgClass="bg-red-500-a50"
        activeBgClass="bg-red-500-a25"
      />
    </section>
  );
}
