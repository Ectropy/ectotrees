import { ScanText, ScanEye, EyeClosed, Eye, Cloud, CloudOff, CloudUpload, CloudCheck } from 'lucide-react';
import { LOCATION_COORDS, LOCATION_HINTS, locationsForHint } from '@shared/hints';
import { TREE_TYPE_LABELS } from '@shared-browser/treeLabels';
import { Tooltip } from './ui/tooltip';
import { SelectCombobox } from './ui/combobox';

const TREE_TYPE_GROUPS = [
  {
    label: 'Strange Sapling',
    items: [
      'sapling', 'sapling-tree', 'sapling-oak', 'sapling-willow',
      'sapling-maple', 'sapling-yew', 'sapling-magic', 'sapling-elder',
    ] as string[],
  },
  {
    label: 'Evil Trees',
    items: ['mature', 'tree', 'oak', 'willow', 'maple', 'yew', 'magic', 'elder'] as string[],
  },
];
const LOCATION_OPTIONS = Object.keys(LOCATION_COORDS).sort();
const HINT_OPTIONS = LOCATION_HINTS.map(lh => lh.hint).sort();

interface PostSpawnFormProps {
  treeType: string;
  exactLocation: string;
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
  onTreeTypeChange: (v: string) => void;
  onExactLocationChange: (v: string) => void;
  onHintChange: (v: string) => void;
  onScanDialog: () => void;
  onAutoScanToggle: () => void;
  onAutoSubmitToggle: () => void;
  onSubmit: () => void;
  onClear: () => void;
}

export function PostSpawnForm({
  treeType,
  exactLocation,
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
  onTreeTypeChange,
  onExactLocationChange,
  onHintChange,
  onScanDialog,
  onAutoScanToggle,
  onAutoSubmitToggle,
  onSubmit,
  onClear,
}: PostSpawnFormProps) {
  const statusColors = {
    ok: 'text-success',
    warn: 'text-warning',
    error: 'text-destructive',
    '': 'text-muted-foreground',
  };

  const availableLocations = hint ? locationsForHint(hint) : LOCATION_OPTIONS;

  return (
    <section className="px-3 py-2">
      {/* Tree type */}
      <div className="flex flex-col">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Tree type
        </label>
        <SelectCombobox
          items={TREE_TYPE_GROUPS}
          itemToStringLabel={item => TREE_TYPE_LABELS[item as keyof typeof TREE_TYPE_LABELS] ?? item}
          value={treeType || null}
          onValueChange={(v) => onTreeTypeChange(v ?? '')}
          placeholder="Select or type a tree type"
        />
      </div>

      {/* Location hint */}
      <div className="flex flex-col mt-2">
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

      {/* Exact location with inline scan buttons */}
      <div className="flex flex-col mt-2">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Exact location
        </label>
        <div className="flex items-center gap-1.5">
          <SelectCombobox
            items={availableLocations}
            value={exactLocation || null}
            onValueChange={(v) => onExactLocationChange(v ?? '')}
            placeholder="Select or type an exact location"
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

      {/* Status line */}
      <div className={`mt-1.5 text-[11px] min-h-[16px] ${statusColors[statusKind]}`}>
        {statusMsg}
      </div>

      <hr className="border-t border-border my-2" />

      {/* Submit / Clear */}
      <div className="flex gap-2">
        <div className="flex flex-1 rounded overflow-hidden">
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="flex-1 bg-success text-white py-2 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:opacity-90 transition-opacity"
          >
            {autoCountdown !== null ? `Submit (${autoCountdown}s)` : 'Submit'}
          </button>
          <div className="w-px bg-white/20 self-stretch" />
          <Tooltip
            content={
              cloudCheck
                ? 'Submitted!'
                : autoCountdown !== null
                ? `Submitting in ${autoCountdown}s — click to cancel`
                : autoSubmit
                ? 'Click to disable auto-submit.'
                : 'Click to enable auto-submit. Submits 10s after a field is filled.'
            }
            side="top"
          >
            <button
              onClick={onAutoSubmitToggle}
              aria-label="Toggle auto-submit"
              className={`flex items-center justify-center px-2.5 text-white hover:opacity-90 transition-opacity ${autoSubmit || cloudCheck ? 'bg-success' : 'bg-success/40'}`}
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
