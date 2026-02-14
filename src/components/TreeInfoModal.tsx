import { useState } from 'react';
import { TREE_TYPES, TREE_TYPE_LABELS, LOCATION_HINTS } from '../constants/evilTree';
import type { TreeType } from '../constants/evilTree';
import type { TreeInfoPayload } from '../types';

interface Props {
  onSubmit: (payload: TreeInfoPayload) => void;
  onClose: () => void;
}

export function TreeInfoModal({ onSubmit, onClose }: Props) {
  const [treeType, setTreeType] = useState<TreeType>('tree');
  const [hint, setHint] = useState('');
  const [exactLocation, setExactLocation] = useState('');

  const selectedHint = LOCATION_HINTS.find(h => h.hint === hint);
  const availableLocations = selectedHint?.locations ?? [];

  function handleHintChange(newHint: string) {
    setHint(newHint);
    setExactLocation('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hint) return;
    onSubmit({
      treeType,
      treeHint: hint,
      treeExactLocation: exactLocation || undefined,
    });
    onClose();
  }

  const selectClass = 'w-full bg-gray-600 text-white text-[11px] rounded px-1.5 py-0.5 border border-gray-500 focus:outline-none focus:border-blue-400';

  return (
    <div
      className="absolute z-50 bottom-full left-0 mb-1 bg-gray-700 border border-gray-500
        rounded shadow-xl p-2 w-64"
      onClick={e => e.stopPropagation()}
    >
      <div className="text-xs text-gray-200 font-semibold mb-1.5">Tree Info</div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <div>
          <label className="text-[10px] text-gray-400 block mb-0.5">Type</label>
          <select
            value={treeType}
            onChange={e => setTreeType(e.target.value as TreeType)}
            className={selectClass}
          >
            {TREE_TYPES.map(type => (
              <option key={type} value={type}>
                {TREE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-gray-400 block mb-0.5">
            Location hint <span className="text-red-400">*</span>
          </label>
          <select
            value={hint}
            onChange={e => handleHintChange(e.target.value)}
            className={selectClass}
            required
          >
            <option value="">— select hint —</option>
            {LOCATION_HINTS.map(lh => (
              <option key={lh.hint} value={lh.hint}>
                {lh.hint}
              </option>
            ))}
          </select>
        </div>

        {availableLocations.length > 0 && (
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">
              Exact location <span className="text-gray-500">(optional)</span>
            </label>
            <select
              value={exactLocation}
              onChange={e => setExactLocation(e.target.value)}
              className={selectClass}
            >
              <option value="">— unknown —</option>
              {availableLocations.map(loc => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-1 mt-0.5">
          <button
            type="submit"
            disabled={!hint}
            className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed
              text-white text-xs rounded py-0.5 transition-colors"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded py-0.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
