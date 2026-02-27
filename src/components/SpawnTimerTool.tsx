import { Timer } from 'lucide-react';
import { SPAWN_COLOR } from '../constants/toolColors';

interface Props {
  onClick: () => void;
}

export function SpawnTimerTool({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Set spawn timer"
      className={`w-7 h-6 flex items-center justify-center rounded
        bg-gray-700 ${SPAWN_COLOR.toolHover} text-gray-300 hover:text-white
        text-sm transition-colors cursor-pointer`}
    >
      <Timer className="h-3.5 w-3.5" />
    </button>
  );
}
