import { useState } from 'react';
import { TREE_TYPES, TREE_TYPE_LABELS, LOCATION_HINTS } from '../constants/evilTree';
import type { TreeType } from '../constants/evilTree';
import type { WorldConfig, TreeInfoPayload } from '../types';

interface Props {
  world: WorldConfig;
  onSubmit: (info: TreeInfoPayload) => void;
  onBack: () => void;
}

export function TreeInfoView({ world, onSubmit, onBack }: Props) {
  const [treeType, setTreeType] = useState<TreeType>('tree');
  const [hint, setHint] = useState('');
  const [exactLocation, setExactLocation] = useState('');
  const [health, setHealth] = useState<number | null>(null);

  const selectedHint = LOCATION_HINTS.find(h => h.hint === hint);
  const availableLocations = selectedHint?.locations ?? [];
  const isP2P = world.type === 'P2P';

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
      treeHealth: health ?? undefined,
    });
  }

  const selectClass = 'w-full bg-gray-600 text-white text-sm rounded px-2 py-1.5 border border-gray-500 focus:outline-none focus:border-blue-400';

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="text-sm text-blue-400 hover:text-blue-300 mb-3 transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">🌳 Tree Info</h1>
              <p className="text-sm text-gray-400">
                World {world.id} · <span className={isP2P ? 'text-yellow-200' : 'text-blue-200'}>{world.type}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Help text */}
          <div className="bg-gray-800 border border-gray-700 rounded p-4">
            <p className="text-sm text-gray-300">
              Record details about the current Evil Tree: what type it is and where you spotted it.
            </p>
          </div>

          {/* Tree type */}
          <div>
            <label className="text-xs text-gray-400 block mb-2 font-semibold">Tree Type</label>
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
            <p className="text-xs text-gray-500 mt-2">
              The type of Evil Tree that currently exists.
            </p>
          </div>

          {/* Location hint */}
          <div>
            <label className="text-xs text-gray-400 block mb-2 font-semibold">
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
              <p className="text-xs text-gray-500 mt-2">
                The specific spawn location, if known.
              </p>
            </div>
          )}

          {/* Health remaining */}
          <div>
            <label className="text-xs text-gray-400 block mb-2 font-semibold">
              Health remaining <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: 20 }, (_, i) => (100 - i * 5)).map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setHealth(health === pct ? null : pct)}
                  className={`text-xs font-medium rounded py-1.5 transition-colors ${
                    health === pct
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Approximate health of the tree, if known. Tap again to deselect.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={!hint}
              className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed
                text-white font-medium rounded py-2 transition-colors"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={onBack}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
