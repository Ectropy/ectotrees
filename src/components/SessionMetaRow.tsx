import { TreeDeciduous } from 'lucide-react';
import { MemberCount } from './MemberCount';
import { relativeTime } from '../lib/relativeTime';
import { TEXT_COLOR } from '../constants/toolColors';

interface SessionMetaRowProps {
  activeWorldCount: number;
  dashboards: number;
  scouts: number;
  lastActivityAt: number;
}

type SessionStatsProps = Pick<SessionMetaRowProps, 'activeWorldCount' | 'dashboards' | 'scouts'>;

/** Just the counts flex row: active worlds + member/scout counts.
 *  Split out so the join card can position it independently of the Active line. */
export function SessionStats({ activeWorldCount, dashboards, scouts }: SessionStatsProps) {
  return (
    <div className="flex items-center gap-3 text-xs shrink-0">
      <span className={`flex items-center gap-1 ${TEXT_COLOR.prominent}`}>
        <TreeDeciduous className="w-3 h-3" /> {activeWorldCount}
      </span>
      <MemberCount clientCount={dashboards} scouts={scouts} connected={true} className="text-xs" />
    </div>
  );
}

/** Shared session stats row: active worlds, member/scout counts, and last-activity time.
 *  Used by the session browser cards and the code-entry join screen. */
export function SessionMetaRow({ activeWorldCount, dashboards, scouts, lastActivityAt }: SessionMetaRowProps) {
  return (
    <>
      <SessionStats activeWorldCount={activeWorldCount} dashboards={dashboards} scouts={scouts} />
      <p className={`text-xs ${TEXT_COLOR.faint} mt-1`}>Active {relativeTime(lastActivityAt)}</p>
    </>
  );
}
