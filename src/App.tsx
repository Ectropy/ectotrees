import { useState } from 'react';
import worldsConfig from './data/worlds.json';
import { useWorldStates } from './hooks/useWorldStates';
import { WorldCard } from './components/WorldCard';
import { SpawnTimerView } from './components/SpawnTimerView';
import { TreeInfoView } from './components/TreeInfoView';
import { TreeDeadView } from './components/TreeDeadView';
import { WorldDetailView } from './components/WorldDetailView';
import type { WorldConfig } from './types';

const worlds = worldsConfig.worlds as WorldConfig[];

type ActiveView =
  | { kind: 'grid' }
  | { kind: 'spawn' | 'tree' | 'dead' | 'detail'; worldId: number };

export default function App() {
  const { worldStates, setSpawnTimer, setTreeInfo, markDead, clearWorld } = useWorldStates();
  const [activeView, setActiveView] = useState<ActiveView>({ kind: 'grid' });

  function handleOpenTool(worldId: number, tool: 'spawn' | 'tree' | 'dead') {
    setActiveView({ kind: tool, worldId });
  }

  function handleOpenCard(worldId: number) {
    setActiveView({ kind: 'detail', worldId });
  }

  function handleBack() {
    setActiveView({ kind: 'grid' });
  }

  // Full-screen view rendering
  if (activeView.kind !== 'grid') {
    const { worldId } = activeView;
    const world = worlds.find(w => w.id === worldId)!;

    if (activeView.kind === 'spawn')
      return <SpawnTimerView
        world={world}
        onSubmit={(ms, info) => { setSpawnTimer(worldId, ms, info); handleBack(); }}
        onBack={handleBack}
      />;
    if (activeView.kind === 'tree')
      return <TreeInfoView
        world={world}
        onSubmit={(info) => { setTreeInfo(worldId, info); handleBack(); }}
        onBack={handleBack}
      />;
    if (activeView.kind === 'dead')
      return <TreeDeadView
        world={world}
        onConfirm={() => { markDead(worldId); handleBack(); }}
        onBack={handleBack}
      />;
    if (activeView.kind === 'detail')
      return <WorldDetailView
        world={world}
        state={worldStates[worldId] ?? { treeStatus: 'none' }}
        onClear={() => { clearWorld(worldId); handleBack(); }}
        onBack={handleBack}
        onOpenTool={(tool) => handleOpenTool(worldId, tool)}
      />;
  }

  // Grid view
  return (
    <div className="flex flex-col min-h-screen p-1.5 gap-1.5">
      <header className="flex items-center justify-between px-2 py-1 bg-gray-800 rounded flex-shrink-0">
        <h1 className="text-base font-bold text-amber-400 tracking-wide">
          Ecto Trees
          <small className="ms-2 text-xs font-light">Turning Evil Trees into dead trees.</small>
        </h1>
        <span className="text-[10px] text-gray-500">{worlds.length} worlds</span>
      </header>

      <main
        className="flex-1 overflow-visible"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
          gap: '3px',
          alignContent: 'start',
        }}
      >
        {worlds.map(world => (
          <WorldCard
            key={world.id}
            world={world}
            state={worldStates[world.id] ?? { treeStatus: 'none' }}
            onCardClick={() => handleOpenCard(world.id)}
            onOpenTool={(tool) => handleOpenTool(world.id, tool)}
          />
        ))}
      </main>
    </div>
  );
}
