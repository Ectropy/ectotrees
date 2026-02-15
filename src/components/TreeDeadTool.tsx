interface Props {
  onClick: () => void;
}

export function TreeDeadTool({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Mark tree as dead"
      className="w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
        bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white cursor-pointer"
    >
      ☠
    </button>
  );
}
