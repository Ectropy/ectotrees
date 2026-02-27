import { TreeDeciduous } from 'lucide-react';
import { TREE_COLOR } from '../constants/toolColors';

interface Props {
  onClick: () => void;
}

export function TreeInfoTool({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Set tree info"
      className={`w-7 h-6 flex items-center justify-center rounded text-sm transition-colors
        bg-gray-700 ${TREE_COLOR.toolHover} text-gray-300 hover:text-white cursor-pointer`}
    >
      <TreeDeciduous className="h-3.5 w-3.5" />
    </button>
  );
}
