import { TreeInfoModal } from './TreeInfoModal';
import type { WorldState, TreeInfoPayload } from '../types';

interface Props {
  state: WorldState;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: (info: TreeInfoPayload) => void;
}

export function TreeInfoTool({ state, isOpen, onOpen, onClose, onSubmit }: Props) {
  const enabled =
    state.treeStatus === 'none' ||
    state.treeStatus === 'mature' ||
    state.treeStatus === 'alive';

  return (
    <div className="relative">
      <button
        onClick={enabled ? onOpen : undefined}
        disabled={!enabled}
        title={enabled ? 'Set tree info' : 'No active tree to update'}
        className={`w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
          ${enabled
            ? 'bg-gray-700 hover:bg-green-700 text-gray-300 hover:text-white cursor-pointer'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
      >
        🌳
      </button>
      {isOpen && enabled && (
        <TreeInfoModal onSubmit={onSubmit} onClose={onClose} />
      )}
    </div>
  );
}
