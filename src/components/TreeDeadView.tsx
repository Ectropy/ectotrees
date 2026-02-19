import type { WorldConfig } from '../types';
import { DEAD_CLEAR_MS } from '../constants/evilTree';

interface Props {
  world: WorldConfig;
  onConfirm: () => void;
  onBack: () => void;
}

export function TreeDeadView({ world, onConfirm, onBack }: Props) {
  const isP2P = world.type === 'P2P';
  const deadMinutes = DEAD_CLEAR_MS / 60_000;

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
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">☠ Mark Tree as Dead</h1>
            <p className="text-sm text-gray-400">
              World {world.id} · <span className={isP2P ? 'text-yellow-200' : 'text-blue-200'}>{world.type}</span>
            </p>
          </div>
        </div>

        {/* Confirmation card */}
        <div className="space-y-6">
          {/* Main message */}
          <div className="bg-gray-800 border border-red-800 rounded p-6 text-center">
            <p className="text-lg text-gray-200 mb-2">Confirm: Tree is dead?</p>
            <p className="text-sm text-gray-400">
              This will start the {deadMinutes}-minute reward window timer.
            </p>
          </div>

          {/* Help text */}
          <div className="bg-gray-800 border border-gray-700 rounded p-4">
            <h3 className="text-sm font-semibold text-gray-200 mb-2">What happens:</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>✓ Keeps any known hint/location intel</li>
              <li>✓ Starts a {deadMinutes}-minute countdown for the reward window</li>
              <li>✓ After {deadMinutes} min, the tree status resets to "none"</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onConfirm}
              className="flex-1 bg-red-700 hover:bg-red-600 text-white font-medium rounded py-2.5 transition-colors text-lg"
            >
              Confirm Dead
            </button>
            <button
              onClick={onBack}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
