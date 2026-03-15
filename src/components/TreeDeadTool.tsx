import { Skull } from 'lucide-react';
import { DEAD_COLOR } from '../constants/toolColors';
import { ToolButton } from './ToolButton';

export function TreeDeadTool({ onClick }: { onClick: () => void }) {
  return <ToolButton icon={Skull} title="Mark tree as dead" toolHover={DEAD_COLOR.toolHover} onClick={onClick} />;
}
