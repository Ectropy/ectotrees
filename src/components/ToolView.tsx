import type { ReactNode } from 'react';
import type { WorldConfig } from '../types';
import { ViewHeader } from './ViewHeader';

interface Props {
  icon: ReactNode;
  title: string;
  world: WorldConfig;
  children: ReactNode;
}

export function ToolView({ icon, title, world, children }: Props) {
  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <ViewHeader icon={icon} title={title} world={world} />
        </div>
        {children}
      </div>
    </div>
  );
}
