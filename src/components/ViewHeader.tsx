import type { WorldConfig } from '../types';
import { P2P_COLOR, F2P_COLOR } from '../constants/toolColors';

interface Props {
  icon: React.ReactNode;
  title: string;
  world: WorldConfig;
  children?: React.ReactNode;
}

export function ViewHeader({ icon, title, world, children }: Props) {
  const isP2P = world.type === 'P2P';
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
        {icon} {title} {children}
      </h1>
      <p className="text-sm text-gray-400">
        World {world.id} · <span className={`text-xs font-semibold px-1 py-px rounded ${isP2P ? P2P_COLOR.badge : F2P_COLOR.badge}`}>{world.type}</span>
      </p>
    </div>
  );
}
