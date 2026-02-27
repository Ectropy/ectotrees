import { Skull } from 'lucide-react';
import { DEAD_COLOR } from '../constants/toolColors';

interface Props {
  onClick: () => void;
}

export function TreeDeadTool({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Mark tree as dead"
      className={`w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
        bg-gray-700 ${DEAD_COLOR.toolHover} text-gray-300 hover:text-white cursor-pointer`}
    >
      <Skull className="h-3.5 w-3.5" />
    </button>
  );
}
