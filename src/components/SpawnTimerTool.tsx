interface Props {
  onClick: () => void;
}

export function SpawnTimerTool({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Set spawn timer"
      className="w-7 h-6 flex items-center justify-center rounded
        bg-gray-700 hover:bg-blue-700 text-gray-300 hover:text-white
        text-sm transition-colors cursor-pointer"
    >
      ⏱
    </button>
  );
}
