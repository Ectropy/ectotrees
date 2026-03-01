import { useState, useEffect } from 'react';
import { TreeDeciduous } from 'lucide-react';
import { TREE_TYPE_LABELS, TREE_TYPE_SHORT, LOCATION_HINTS } from '../constants/evilTree';
import { TREE_COLOR, TEXT_COLOR } from '../constants/toolColors';
import { ViewHeader } from './ViewHeader';
import type { TreeType } from '../constants/evilTree';
import type { WorldConfig, WorldState, TreeInfoPayload, TreeFieldsPayload } from '../types';
import { HealthButtonGrid } from './HealthButtonGrid';
import { SelectCombobox } from './ui/select-combobox';

const TREE_TYPE_GROUPS = [
  { label: 'Strange Sapling', items: ['sapling'] as string[] },
  { label: 'Evil Trees', items: ['mature', 'tree', 'oak', 'willow', 'maple', 'yew', 'magic', 'elder'] as string[] },
];

interface Props {
  world: WorldConfig;
  existingState?: WorldState;
  onSubmit: (info: TreeInfoPayload, source?: 'default' | 'override') => void;
  onUpdate: (fields: TreeFieldsPayload) => void;
  onBack: () => void;
}

export function TreeInfoView({ world, existingState, onSubmit, onUpdate, onBack }: Props) {
  const isUpdateMode = existingState !== undefined &&
    (existingState.treeStatus === 'sapling' || existingState.treeStatus === 'mature' || existingState.treeStatus === 'alive');

  const [treeType, setTreeType] = useState<TreeType | null>(existingState?.treeType ?? null);
  const [hint, setHint] = useState(existingState?.treeHint ?? '');
  const [exactLocation, setExactLocation] = useState(existingState?.treeExactLocation ?? '');
  const [health, setHealth] = useState<number | null>(existingState?.treeHealth ?? null);
  const [confirmOverride, setConfirmOverride] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onBack();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  const selectedHint = LOCATION_HINTS.find(h => h.hint === hint);
  const availableLocations = selectedHint?.locations ?? [];
  const isStrangeSapling = treeType != null && (treeType === 'sapling' || treeType.startsWith('sapling-'));
  const saplingTypeOptions = ['tree', 'oak', 'willow', 'maple', 'yew', 'magic', 'elder'];

  function resolveExactLocationFromHint(newHint: string): string {
    const match = LOCATION_HINTS.find(h => h.hint === newHint);
    return match?.locations.length === 1 ? match.locations[0] : '';
  }

  function handleHintChange(newHint: string) {
    setHint(newHint);
    setExactLocation(resolveExactLocationFromHint(newHint));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hint || !treeType) return;
    const payload = {
      treeType,
      treeHint: hint,
      treeExactLocation: exactLocation || undefined,
      treeHealth: isStrangeSapling ? undefined : (health ?? undefined),
    };
    if (isUpdateMode) {
      onUpdate(payload);
    } else {
      onSubmit(payload, 'default');
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <ViewHeader icon={<TreeDeciduous className="h-5 w-5" />} title="Tree Info" world={world} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Help text */}
          <div className="bg-gray-800 border border-gray-700 rounded p-4">
            <p className="text-sm text-gray-300">
              {isUpdateMode
                ? 'Update recorded details about the current Evil Tree. Timers will not be reset.'
                : 'Record details about the current Evil Tree: what type it is and where you spotted it.'}
            </p>
          </div>

          {/* Tree type */}
          <div>
            <label className="text-xs text-gray-400 block mb-2 font-semibold">Tree Type</label>
            <SelectCombobox
              items={TREE_TYPE_GROUPS}
              itemToStringLabel={item => TREE_TYPE_LABELS[item as TreeType] ?? item}
              value={treeType}
              onValueChange={v => setTreeType(v as TreeType | null)}
              autoFocus
              autoHighlight
              placeholder="Select or type a tree type"
            />
            <p className="text-xs text-gray-500 mt-2">
              The type of Evil Tree that currently exists.
            </p>
          </div>

          {/* Strange Sapling message and type selector */}
          {isStrangeSapling && (
            <div className="bg-blue-900 border border-blue-700 rounded p-4 space-y-3">
              <p className="text-sm text-blue-100">
                Strange saplings can be inspected to determine their type. Select the type it will grow into, or leave as unknown.
              </p>
              <div>
                <label className="text-xs text-gray-400 block mb-2 font-semibold">
                  Expected type <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <SelectCombobox
                  items={saplingTypeOptions}
                  itemToStringLabel={item => TREE_TYPE_SHORT[item as TreeType] ?? item}
                  value={treeType === 'sapling' ? null : treeType!.replace('sapling-', '')}
                  onValueChange={v => setTreeType(v ? `sapling-${v}` as TreeType : 'sapling')}
                  clearLabel="Unknown"
                  autoHighlight
                  placeholder="Unknown"
                />
              </div>
            </div>
          )}

          {/* Location hint */}
          <div>
            <label className="text-xs text-gray-400 block mb-2 font-semibold">
              Location hint <span className="text-red-400">*</span>
            </label>
            <SelectCombobox
              items={LOCATION_HINTS.map(lh => lh.hint)}
              value={hint || null}
              onValueChange={v => handleHintChange(v ?? '')}
              autoHighlight
              placeholder="Select or type a location hint"
            />
            <p className="text-xs text-gray-500 mt-2">
              A general area or region where the tree is located. Required.
            </p>
          </div>

          {/* Exact location */}
          {availableLocations.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 block mb-2 font-semibold">
                Exact location <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <SelectCombobox
                items={availableLocations}
                value={exactLocation || null}
                onValueChange={v => setExactLocation(v ?? '')}
                clearLabel="— none —"
                autoHighlight
                placeholder="Select or type an exact location"
              />
              <p className="text-xs text-gray-500 mt-2">
                The specific spawn location, if known.
              </p>
            </div>
          )}

          {/* Health remaining */}
          {!isStrangeSapling && (
            <div>
              <label className="text-xs text-gray-400 block mb-2 font-semibold">
                Health remaining <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <HealthButtonGrid
                value={health ?? undefined}
                onChange={v => setHealth(v ?? null)}
              />
              <p className="text-xs text-gray-500 mt-2">
                Approximate health of the tree, if known. Tap again to deselect.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={!hint || !treeType}
              className={`flex-1 ${TREE_COLOR.bg} ${TREE_COLOR.bgHover} disabled:opacity-40 disabled:cursor-not-allowed
                text-white font-medium rounded py-2 transition-colors`}
            >
              {isUpdateMode ? 'Update Tree Info' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Override option (update mode only) */}
          {isUpdateMode && (
            confirmOverride ? (
              <div className="bg-gray-800 border border-amber-700 rounded p-4 space-y-3">
                <p className={`text-sm ${TEXT_COLOR.prominent}`}>Replace all data and restart timers?</p>
                <p className="text-xs text-gray-400">
                  This will discard the current timer and treat this as a brand-new tree sighting. Use this if the previous data was wrong
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={!hint || !treeType}
                    onClick={() => {
                      if (!hint || !treeType) return;
                      onSubmit({
                        treeType,
                        treeHint: hint,
                        treeExactLocation: exactLocation || undefined,
                        treeHealth: isStrangeSapling ? undefined : (health ?? undefined),
                      }, 'override');
                    }}
                    className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed
                      text-white font-medium rounded py-2 text-sm transition-colors"
                  >
                    Yes, override
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOverride(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setConfirmOverride(true)}
                  className="text-sm text-gray-500 hover:text-amber-400 underline underline-offset-2 transition-colors"
                >
                  Override &amp; restart timers
                </button>
              </div>
            )
          )}
        </form>
      </div>
    </div>
  );
}
