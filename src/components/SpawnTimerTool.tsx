import { TimePickerModal } from './TimePickerModal';
import type { WorldState } from '../types';

interface Props {
  state: WorldState;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: (msFromNow: number) => void;
}

export function SpawnTimerTool({ state: _state, isOpen, onOpen, onClose, onSubmit }: Props) {
  return (
    <div className="relative">
      <button
        onClick={onOpen}
        title="Set spawn timer"
        className="w-7 h-6 flex items-center justify-center rounded
          bg-gray-700 hover:bg-blue-700 text-gray-300 hover:text-white
          text-sm transition-colors cursor-pointer"
      >
        ⏱
      </button>
      {isOpen && (
        <TimePickerModal onSubmit={onSubmit} onClose={onClose} />
      )}
    </div>
  );
}
