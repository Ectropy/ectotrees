import { useState } from 'react';
import type { MemberInfo, MemberRole } from '../../shared/protocol.ts';

interface MemberPanelProps {
  members: MemberInfo[];
  myRole: MemberRole | null;
  lastInvite: { inviteToken: string; name: string; link: string } | null;
  onCreateInvite: (name: string, role?: 'scout' | 'viewer') => void;
  onBanMember: (inviteToken: string) => void;
  onSetMemberRole: (inviteToken: string, role: 'moderator' | 'scout' | 'viewer') => void;
}

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'text-amber-400',
  moderator: 'text-blue-400',
  scout: 'text-green-400',
  viewer: 'text-gray-400',
};

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  moderator: 'Mod',
  scout: 'Scout',
  viewer: 'Viewer',
};

export function MemberPanel({ members, myRole, lastInvite, onCreateInvite, onBanMember, onSetMemberRole }: MemberPanelProps) {
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'scout' | 'viewer'>('scout');
  const [copiedLink, setCopiedLink] = useState(false);
  const isAdmin = myRole === 'owner' || myRole === 'moderator';

  function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    const name = inviteName.trim();
    if (!name) return;
    onCreateInvite(name, inviteRole);
    setInviteName('');
  }

  async function handleCopyLink() {
    if (!lastInvite) return;
    try {
      await navigator.clipboard.writeText(lastInvite.link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* ignore */ }
  }

  function canModify(target: MemberInfo): boolean {
    if (!target.inviteToken) return false;
    if (target.role === 'owner') return false;
    if (myRole === 'owner') return true;
    if (myRole === 'moderator' && target.role !== 'moderator') return true;
    return false;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs space-y-0.5">
        {members.map((m) => (
          <div key={m.name} className="flex items-center gap-1.5 group">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.online ? 'bg-green-500' : 'bg-gray-600'}`} />
            <span className="text-gray-200 truncate">{m.name}</span>
            <span className={`${ROLE_COLORS[m.role]} text-[10px] opacity-70`}>{ROLE_LABELS[m.role]}</span>
            {m.currentWorld !== null && <span className="text-gray-600 text-[10px]">W{m.currentWorld}</span>}

            {canModify(m) && (
              <span className="ml-auto hidden group-hover:flex items-center gap-1">
                <select
                  className="bg-gray-700 text-gray-300 text-[10px] rounded px-0.5 cursor-pointer"
                  value={m.role}
                  onChange={(e) => onSetMemberRole(m.inviteToken!, e.target.value as 'moderator' | 'scout' | 'viewer')}
                >
                  {myRole === 'owner' && <option value="moderator">Mod</option>}
                  <option value="scout">Scout</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={() => onBanMember(m.inviteToken!)}
                  className="text-red-500 hover:text-red-400 text-[10px] transition-colors"
                  title={`Ban ${m.name}`}
                >
                  Ban
                </button>
              </span>
            )}
          </div>
        ))}
      </div>

      {lastInvite && (
        <div className="bg-gray-700/50 rounded px-2 py-1 text-xs">
          <div className="text-gray-400">Invite for <span className="text-gray-200">{lastInvite.name}</span>:</div>
          <div className="flex items-center gap-1 mt-0.5">
            <code className="text-amber-300 text-[11px] truncate flex-1">{lastInvite.inviteToken}</code>
            <button
              onClick={handleCopyLink}
              className="text-gray-400 hover:text-gray-200 text-[10px] transition-colors flex-shrink-0"
            >
              {copiedLink ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      )}

      {isAdmin && (
        <form onSubmit={handleCreateInvite} className="flex items-center gap-1">
          <input
            type="text"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Name"
            className="flex-1 min-w-0 px-1.5 py-0.5 bg-gray-700 text-white rounded text-xs placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as 'scout' | 'viewer')}
            className="bg-gray-700 text-gray-300 rounded text-xs px-1 py-0.5"
          >
            <option value="scout">Scout</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={!inviteName.trim()}
            className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded text-xs transition-colors"
          >
            Invite
          </button>
        </form>
      )}
    </div>
  );
}
