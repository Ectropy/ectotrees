import { Timer, TreeDeciduous, Skull } from 'lucide-react';
import { SPAWN_COLOR, TREE_COLOR, DEAD_COLOR } from '../../../src/constants/toolColors';

interface ModeNavProps {
  mode: 'prespawn' | 'postspawn' | 'dead';
  onChange: (mode: 'prespawn' | 'postspawn' | 'dead') => void;
}

const TABS = [
  {
    kind: 'prespawn' as const,
    icon: Timer,
    label: 'Timer',
    activeColor: SPAWN_COLOR.text,
    hoverBg: SPAWN_COLOR.borderHover,
    underline: SPAWN_COLOR.underline,
  },
  {
    kind: 'postspawn' as const,
    icon: TreeDeciduous,
    label: 'Tree',
    activeColor: TREE_COLOR.text,
    hoverBg: TREE_COLOR.borderHover,
    underline: TREE_COLOR.underline,
  },
  {
    kind: 'dead' as const,
    icon: Skull,
    label: 'Dead',
    activeColor: DEAD_COLOR.text,
    hoverBg: DEAD_COLOR.borderHover,
    underline: DEAD_COLOR.underline,
  },
];

export function ModeNav({ mode, onChange }: ModeNavProps) {
  return (
    <div className="flex items-center justify-center gap-1 px-2 py-1 border-b border-border">
      {TABS.map(({ kind, icon: Icon, label, activeColor, hoverBg, underline }) => {
        const isActive = mode === kind;
        const activeClass = `${activeColor} ${hoverBg} ${underline}`;
        const inactiveClass = `text-muted-foreground hover:text-foreground ${hoverBg}`;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onChange(kind)}
            aria-pressed={isActive}
            className={`flex items-center gap-1 px-2 py-1 ${isActive ? 'rounded-t' : 'rounded'} transition-colors ${isActive ? activeClass : inactiveClass}`}
          >
            <Icon size={14} />
            <span className="text-[11px]">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
