import { TreeInfoModal } from './TreeInfoModal';
import type { TreeInfoPayload } from '../types';

interface Props {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSubmit: (info: TreeInfoPayload) => void;
}

export function TreeInfoTool({ isOpen, onOpen, onClose, onSubmit }: Props) {
  return (
    <div className="relative">
      <button
        onClick={onOpen}
        title="Set tree info"
        className="w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
          bg-gray-700 hover:bg-green-700 text-gray-300 hover:text-white cursor-pointer"
      >
        🌳
      </button>
      {isOpen && (
        <TreeInfoModal onSubmit={onSubmit} onClose={onClose} />
      )}
    </div>
  );
}
