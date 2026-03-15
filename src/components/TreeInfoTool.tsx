import { TreeDeciduous } from 'lucide-react';
import { TREE_COLOR } from '../constants/toolColors';
import { ToolButton } from './ToolButton';

export function TreeInfoTool({ onClick }: { onClick: () => void }) {
  return <ToolButton icon={TreeDeciduous} title="Set tree info" toolHover={TREE_COLOR.toolHover} onClick={onClick} />;
}
