import { Timer } from 'lucide-react';
import { SPAWN_COLOR } from '../constants/toolColors';
import { ToolButton } from './ToolButton';

export function SpawnTimerTool({ onClick }: { onClick: () => void }) {
  return <ToolButton icon={Timer} title="Set spawn timer" toolHover={SPAWN_COLOR.toolHover} onClick={onClick} />;
}
