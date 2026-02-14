interface Props {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function TreeDeadTool({ isOpen, onOpen, onClose, onConfirm }: Props) {
  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <div className="relative">
      <button
        onClick={onOpen}
        title="Mark tree as dead"
        className="w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
          bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white cursor-pointer"
      >
        ☠
      </button>

      {isOpen && (
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
