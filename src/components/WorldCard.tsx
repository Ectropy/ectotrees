import type { WorldConfig, WorldState } from '../types';
import { StatusSection } from './StatusSection';
import { SpawnTimerTool } from './SpawnTimerTool';
import { TreeInfoTool } from './TreeInfoTool';
import { TreeDeadTool } from './TreeDeadTool';

interface Props {
  world: WorldConfig;
  state: WorldState;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onCardClick: () => void;
  onOpenTool: (tool: 'spawn' | 'tree' | 'dead') => void;
}

export function WorldCard({ world, state, isFavorite, onToggleFavorite, onCardClick, onOpenTool }: Props) {
  const isP2P = world.type === 'P2P';
  const borderColor = isP2P ? 'border-yellow-500' : 'border-blue-500';

  return (
    <div
      data-testid={`world-card-${world.id}`}
      className={`flex flex-col border ${borderColor} rounded bg-gray-800 text-white cursor-pointer`}
      style={{ height: '85px' }}
      onClick={onCardClick}
    >
      <div className="flex items-center justify-between px-1.5 pt-1 flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-gray-100">w{world.id}</span>
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
            className={`text-[11px] leading-none transition-colors ${
              isFavorite ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {isFavorite ? '★' : '☆'}
          </button>
        </div>
        <span
          className={`text-[8px] font-semibold px-1 py-px rounded
            ${isP2P ? 'text-yellow-100 border border-yellow-500' : 'text-blue-200 border border-blue-500'}`}
        >
          {world.type}
        </span>
      </div>

      <div className="flex-1 px-1.5 min-h-0">
        <StatusSection state={state} />
      </div>

      <div
        className="flex items-center justify-around px-1 pb-1 flex-shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <SpawnTimerTool onClick={() => onOpenTool('spawn')} />
        <TreeInfoTool onClick={() => onOpenTool('tree')} />
        <TreeDeadTool onClick={() => onOpenTool('dead')} />
      </div>
    </div>
  );
}
