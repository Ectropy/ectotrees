import type { WorldConfig, WorldState } from '../types';
import { StatusSection } from './StatusSection';
import { SpawnTimerTool } from './SpawnTimerTool';
import { TreeInfoTool } from './TreeInfoTool';
import { TreeDeadTool } from './TreeDeadTool';

interface Props {
  world: WorldConfig;
  state: WorldState;
  onOpenTool: (tool: 'spawn' | 'tree' | 'dead') => void;
}

export function WorldCard({ world, state, onOpenTool }: Props) {
  const isP2P = world.type === 'P2P';
  const borderColor = isP2P ? 'border-yellow-700' : 'border-blue-800';

  return (
    <div
      className={`flex flex-col border ${borderColor} rounded bg-gray-800 text-white`}
      style={{ height: '85px' }}
    >
      <div className="flex items-center justify-between px-1.5 pt-1 flex-shrink-0">
        <span className="text-[11px] font-bold text-gray-100">W{world.id}</span>
        <span
          className={`text-[8px] font-semibold px-1 py-px rounded
            ${isP2P ? 'bg-yellow-800 text-yellow-200' : 'bg-blue-900 text-blue-200'}`}
        >
          {world.type}
        </span>
      </div>

      <div className="flex-1 px-1.5 min-h-0">
        <StatusSection state={state} />
      </div>

      <div className="flex items-center justify-around px-1 pb-1 flex-shrink-0">
        <SpawnTimerTool onClick={() => onOpenTool('spawn')} />
        <TreeInfoTool onClick={() => onOpenTool('tree')} />
        <TreeDeadTool onClick={() => onOpenTool('dead')} />
      </div>
    </div>
  );
}
