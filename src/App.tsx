import worldsConfig from './data/worlds.json';
import { useWorldStates } from './hooks/useWorldStates';
import { WorldCard } from './components/WorldCard';
import type { WorldConfig } from './types';

const worlds = worldsConfig.worlds as WorldConfig[];

export default function App() {
  const { worldStates, setSpawnTimer, setTreeInfo, markDead, tick } = useWorldStates();

  return (
    <div className="flex flex-col min-h-screen p-1.5 gap-1.5">
      <header className="flex items-center justify-between px-2 py-1 bg-gray-800 rounded flex-shrink-0">
        <h1 className="text-base font-bold text-amber-400 tracking-wide">
          Evil Tree Tracker
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
            onSetSpawn={(ms) => setSpawnTimer(world.id, ms)}
            onSetTree={(info) => setTreeInfo(world.id, info)}
            onMarkDead={() => markDead(world.id)}
            tick={tick}
          />
        ))}
      </main>
    </div>
  );
}
