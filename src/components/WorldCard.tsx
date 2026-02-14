import { useState } from 'react';
import type { WorldConfig, WorldState, TreeInfoPayload } from '../types';
import { StatusSection } from './StatusSection';
import { SpawnTimerTool } from './SpawnTimerTool';
import { TreeInfoTool } from './TreeInfoTool';
import { TreeDeadTool } from './TreeDeadTool';

interface Props {
  world: WorldConfig;
  state: WorldState;
  onSetSpawn: (ms: number) => void;
  onSetTree: (info: TreeInfoPayload) => void;
  onMarkDead: () => void;
  tick: number;
}

type OpenTool = 'spawn' | 'tree' | 'dead' | null;

export function WorldCard({ world, state, onSetSpawn, onSetTree, onMarkDead, tick }: Props) {
  const [openTool, setOpenTool] = useState<OpenTool>(null);

  const isP2P = world.type === 'P2P';
  const borderColor = isP2P ? 'border-yellow-700' : 'border-blue-800';

  function open(tool: OpenTool) {
    setOpenTool(prev => (prev === tool ? null : tool));
  }

  return (
    <>
      {openTool !== null && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenTool(null)}
        />
      )}
      <div
        className={`relative flex flex-col border ${borderColor} rounded bg-gray-800 text-white overflow-visible`}
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
          <StatusSection state={state} tick={tick} />
        </div>

        <div className="flex items-center justify-around px-1 pb-1 flex-shrink-0">
          <SpawnTimerTool
            state={state}
            isOpen={openTool === 'spawn'}
            onOpen={() => open('spawn')}
            onClose={() => setOpenTool(null)}
            onSubmit={onSetSpawn}
          />
          <TreeInfoTool
            isOpen={openTool === 'tree'}
            onOpen={() => open('tree')}
            onClose={() => setOpenTool(null)}
            onSubmit={onSetTree}
          />
          <TreeDeadTool
            isOpen={openTool === 'dead'}
            onOpen={() => open('dead')}
            onClose={() => setOpenTool(null)}
            onConfirm={onMarkDead}
          />
        </div>
      </div>
    </>
  );
}
