import { LOCATION_COORDS, LOCATION_HINTS, locationsForHint } from '@shared/hints';
import { TREE_COLOR } from '@shared-browser/toolColors';
import { TREE_TYPE_LABELS } from '@shared-browser/treeLabels';
import { SelectCombobox } from './ui/combobox';
import { StatusLine } from './StatusLine';
import { ScanButtons } from './ScanButtons';
import { SubmitBar } from './SubmitBar';

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
        autoSubmitHint="Click to enable auto-submit. Submits 10s after a field is filled."
        borderClass={TREE_COLOR.border}
        labelClass={TREE_COLOR.label}
        textClass={TREE_COLOR.text}
        hoverBgClass="hover:bg-green-400-a20"
        dividerBgClass="bg-green-400-a50"
        activeBgClass="bg-green-400-a25"
      />
    </section>
  );
}
