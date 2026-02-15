interface Props {
  onClick: () => void;
}

export function TreeInfoTool({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Set tree info"
      className="w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
        bg-gray-700 hover:bg-green-700 text-gray-300 hover:text-white cursor-pointer"
    >
      🌳
    </button>
  );
}
