import { useState } from 'react';
import { LOCATION_HINTS } from '../constants/evilTree';
import type { WorldConfig, SpawnTreeInfo } from '../types';

interface Props {
  world: WorldConfig;
  onSubmit: (msFromNow: number, treeInfo?: SpawnTreeInfo) => void;
  onBack: () => void;
}

export function SpawnTimerView({ world, onSubmit, onBack }: Props) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [hint, setHint] = useState('');
  const [exactLocation, setExactLocation] = useState('');

  const selectedHint = LOCATION_HINTS.find(h => h.hint === hint);
  const availableLocations = selectedHint?.locations ?? [];
  const isP2P = world.type === 'P2P';

  function handleHintChange(newHint: string) {
    setHint(newHint);
    setExactLocation('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const totalMs = ((hours * 60) + minutes) * 60 * 1000;
    if (totalMs <= 0) return;
    const treeInfo: SpawnTreeInfo | undefined = hint
      ? { treeHint: hint, treeExactLocation: exactLocation || undefined }
      : undefined;
    onSubmit(totalMs, treeInfo);
  }

  const selectClass = 'w-full bg-gray-600 text-white text-sm rounded px-2 py-1.5 border border-gray-500 focus:outline-none focus:border-blue-400';
  const inputClass = 'bg-gray-600 text-white text-sm rounded px-2 py-1.5 border border-gray-500 focus:outline-none focus:border-blue-400';

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
              <h1 className="text-2xl font-bold text-white mb-1">⏱ Set Spawn Timer</h1>
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
              Set a timer for when the next evil tree should spawn. This is typically ~30 minutes after the previous tree dies.
            </p>
          </div>

          {/* Time inputs */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-200">Time until spawn</label>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Hours</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hours}
                  onChange={e => setHours(Math.max(0, Math.min(23, Number(e.target.value))))}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Minutes</label>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={e => setMinutes(Math.max(0, Math.min(59, Number(e.target.value))))}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 A new tree typically spawns ~30 minutes after the previous one dies.
            </p>
          </div>

          {/* Optional tree info section */}
          <div className="border-t border-gray-700 pt-6">
            <h2 className="text-sm font-semibold text-gray-200 mb-4">
              Upcoming tree location <span className="text-gray-500 font-normal">(optional)</span>
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Location hint</label>
                <select
                  value={hint}
                  onChange={e => handleHintChange(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— none —</option>
                  {LOCATION_HINTS.map(lh => (
                    <option key={lh.hint} value={lh.hint}>
                      {lh.hint}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Optional hint about where the next tree might spawn.
                </p>
              </div>

              {availableLocations.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Exact location</label>
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
                  <p className="text-xs text-gray-500 mt-1">
                    Specific location if known.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={(hours * 60 + minutes) === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                text-white font-medium rounded py-2 transition-colors"
            >
              Set Timer
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
