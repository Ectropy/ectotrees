import type { LucideIcon } from 'lucide-react';

interface ToolButtonProps {
  icon: LucideIcon;
  title: string;
  toolHover: string;
  toolHoverBorder: string;
  onClick: () => void;
}

export function ToolButton({ icon: Icon, title, toolHover, toolHoverBorder, onClick }: ToolButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-6 flex items-center justify-center rounded text-sm transition-colors bg-transparent border border-gray-700 text-gray-300 ${toolHover} ${toolHoverBorder} hover:text-white cursor-pointer`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
