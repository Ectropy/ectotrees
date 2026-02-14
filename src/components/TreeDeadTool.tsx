import type { WorldState } from '../types';

interface Props {
  state: WorldState;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function TreeDeadTool({ state, isOpen, onOpen, onClose, onConfirm }: Props) {
  const enabled =
    state.treeStatus === 'sapling' ||
    state.treeStatus === 'mature' ||
    state.treeStatus === 'alive';

  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <div className="relative">
      <button
        onClick={enabled ? onOpen : undefined}
        disabled={!enabled}
        title={enabled ? 'Mark tree as dead' : 'No active tree'}
        className={`w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
          ${enabled
            ? 'bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white cursor-pointer'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
          }`}
      >
        ☠
      </button>

      {isOpen && enabled && (
        <div
          className="absolute z-50 top-full mt-1 lg:top-auto lg:bottom-full lg:mt-0 lg:mb-1 bg-gray-700 border border-red-600
            rounded shadow-xl p-2 w-32"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-[10px] text-gray-200 mb-1.5">Tree is dead?</div>
          <div className="flex gap-1">
            <button
              onClick={handleConfirm}
              className="flex-1 bg-red-700 hover:bg-red-600 text-white text-[10px] rounded py-0.5 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-[10px] rounded py-0.5 transition-colors"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
