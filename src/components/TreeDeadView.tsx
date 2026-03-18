import { useEscapeKey } from '../hooks/useEscapeKey';
import type { WorldConfig } from '../types';
import { DEAD_CLEAR_MS } from '../constants/evilTree';
import { Skull, Check } from 'lucide-react';
import { DEAD_COLOR, TEXT_COLOR, BUTTON_SECONDARY } from '../constants/toolColors';
import { ToolView } from './ToolView';

interface Props {
  world: WorldConfig;
  onConfirm: () => void;
  onBack: () => void;
}

export function TreeDeadView({ world, onConfirm, onBack }: Props) {
  useEscapeKey(onBack);
  const deadMinutes = DEAD_CLEAR_MS / 60_000;

  return (
    <ToolView icon={<Skull className="h-5 w-5" />} title="Mark Tree as Dead" world={world}>
      {/* Confirmation card */}
      <div className="space-y-6">
          {/* Main message */}
          <div className={`bg-gray-800 border ${DEAD_COLOR.alertBorder} rounded p-6 text-center`}>
            <p className={`text-lg ${TEXT_COLOR.prominent} mb-2`}>Confirm: Tree is dead?</p>
            <p className={`text-sm ${TEXT_COLOR.muted}`}>
              This will start the {deadMinutes}-minute reward window timer.
            </p>
          </div>

          {/* Help text */}
          <div className="bg-gray-800 border border-gray-700 rounded p-4">
            <h3 className={`text-sm font-semibold ${TEXT_COLOR.prominent} mb-2`}>What happens:</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0 text-green-400" /> Keeps any known hint/location intel</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0 text-green-400" /> Starts a {deadMinutes}-minute countdown for the reward window</li>
              <li className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0 text-green-400" /> After {deadMinutes} min, the tree status resets to "none"</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <button
              autoFocus
              onClick={onConfirm}
              className={`flex-1 bg-transparent ${DEAD_COLOR.border} ${DEAD_COLOR.label} ${DEAD_COLOR.borderHover} font-medium rounded py-2.5 transition-colors text-lg`}
            >
              Confirm Dead
            </button>
            <button
              onClick={onBack}
              className={`flex-1 ${BUTTON_SECONDARY} py-2.5`}
            >
              Cancel
            </button>
          </div>
      </div>
    </ToolView>
  );
}
