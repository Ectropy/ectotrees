import { Users } from 'lucide-react';
import { TEXT_COLOR } from '../constants/toolColors';

interface MemberCountProps {
  clientCount: number;
  scouts: number;
  connected: boolean;
  className?: string;
}

export function MemberCount({ clientCount, scouts, connected, className }: MemberCountProps) {
  if (!connected) return null;
  return (
    <span className={`flex items-center gap-1.5 ${TEXT_COLOR.prominent}${className ? ` ${className}` : ''}`}>
      <Users className="w-3 h-3" />
      {clientCount}
      {scouts > 0 && (
        <>
          <span className={TEXT_COLOR.muted}>·</span>
          <span className={`text-[9px] leading-[1.5] font-semibold px-1 py-px rounded border border-gray-400 ${TEXT_COLOR.prominent}`}>Alt1</span>
          {scouts}
        </>
      )}
    </span>
  );
}
