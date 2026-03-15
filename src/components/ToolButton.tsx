import type { LucideIcon } from 'lucide-react';

interface ToolButtonProps {
  icon: LucideIcon;
  title: string;
  toolHover: string;
  onClick: () => void;
}

export function ToolButton({ icon: Icon, title, toolHover, onClick }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-6 flex items-center justify-center rounded text-sm transition-colors bg-gray-700 ${toolHover} text-gray-300 hover:text-white cursor-pointer`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
