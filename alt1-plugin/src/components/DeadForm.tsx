import { Skull } from 'lucide-react';
import { DEAD_COLOR } from '../../../src/constants/toolColors';

interface DeadFormProps {
  statusMsg: string;
  statusKind: 'ok' | 'warn' | 'error' | '';
  canSubmit: boolean;
  onSubmit: () => void;
  onClear: () => void;
}

const statusColors = {
  ok: 'text-success',
  warn: 'text-warning',
  error: 'text-destructive',
  '': 'text-muted-foreground',
};

export function DeadForm({ statusMsg, statusKind, canSubmit, onSubmit, onClear }: DeadFormProps) {
  return (
    <section className="px-3 py-2">
      <p className="text-[11px] text-muted-foreground mb-3">
        Marks this world&apos;s tree as dead and starts the 10-minute fallen tree reward window.
      </p>

      <div className={`mb-2 text-[11px] min-h-[16px] ${statusColors[statusKind]}`}>
        {statusMsg}
      </div>

      <hr className="border-t border-border my-2" />

      <div className="flex gap-2">
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`flex-1 flex items-center justify-center gap-1.5 bg-transparent ${DEAD_COLOR.border} ${DEAD_COLOR.label} ${DEAD_COLOR.borderHover} py-2 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded`}
        >
          <Skull size={13} />
          Mark Dead
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
