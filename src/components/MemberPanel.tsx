import { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../lib/utils';
import type { MemberInfo, MemberRole } from '../../shared/protocol.ts';
import { TEXT_COLOR, ROLE_COLORS, ROLE_LABELS } from '../constants/toolColors';

interface MemberPanelProps {
  members: MemberInfo[];
  myRole: MemberRole | null;
  myName: string | null;
  lastInvite: { inviteToken: string; name: string; link: string } | null;
  onCreateInvite: (name: string, role?: 'scout' | 'viewer') => void;
  onBanMember: (inviteToken: string) => void;
  onSetMemberRole: (inviteToken: string, role: 'moderator' | 'scout' | 'viewer') => void;
}


export function MemberPanel({ members, myRole, myName, lastInvite, onCreateInvite, onBanMember, onSetMemberRole }: MemberPanelProps) {
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'scout' | 'viewer'>('scout');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const isAdmin = myRole === 'owner' || myRole === 'moderator';

  // Derive validity: if the member being confirmed for ban has left, treat as null
  const validConfirmBan = useMemo(
    () => confirmBan && members.some(m => m.inviteToken === confirmBan) ? confirmBan : null,
    [confirmBan, members]
  );

  function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    const name = inviteName.trim();
    if (!name) return;
    onCreateInvite(name, inviteRole);
    setInviteName('');
  }

  async function handleCopyLink(link: string, token: string) {
    const ok = await copyToClipboard(link);
    if (ok) {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(prev => prev === token ? null : prev), 1500);
    }
  }

  function canModify(target: MemberInfo): boolean {
    if (!target.inviteToken) return false;
    if (target.role === 'owner') return false;
    if (myRole === 'owner') return true;
    if (myRole === 'moderator' && target.role !== 'moderator') return true;
    return false;
  }

  return (
    <div className="space-y-3">
      {/* Member table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 text-[10px] uppercase tracking-wide">
            <th className="text-left font-normal pb-1">Username</th>
            <th className="text-left font-normal pb-1">Role</th>
            <th className="text-right font-normal pb-1">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700/50">
          {members.map((m) => (
            <tr key={m.inviteToken ?? m.name} className="group">
              <td className="py-1 pr-2 max-w-0">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.online ? 'bg-green-500' : 'bg-gray-600'}`}
                    title={m.online ? 'Connected' : 'Disconnected'}
                  />
                  <span className="truncate text-gray-200" title={m.name}>
                    {m.name}
                    {m.name === myName && <span className="text-amber-400/70 ml-1 text-[10px]">(you)</span>}
                  </span>
                </span>
              </td>
              <td className="py-1 pr-2 whitespace-nowrap">
                <span className={`${ROLE_COLORS[m.role]} text-[10px]`}>{ROLE_LABELS[m.role]}</span>
              </td>
              <td className="py-1 text-right whitespace-nowrap">
                <span className="inline-flex items-center gap-1 justify-end">
                  {/* Copy invite link */}
                  {m.link && (
                    <button
                      onClick={() => handleCopyLink(m.link!, m.inviteToken!)}
                      className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
                      title={`Copy invite link for ${m.name}`}
                    >
                      {copiedToken === m.inviteToken
                        ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                        : <><Copy className="w-3 h-3" /><span>Copy link</span></>
                      }
                    </button>
                  )}

                  {/* Admin controls */}
                  {canModify(m) && (
                    <>
                      <select
                        className="bg-gray-700 text-gray-300 text-[10px] rounded px-0.5 cursor-pointer"
                        value={m.role}
                        onChange={(e) => onSetMemberRole(m.inviteToken!, e.target.value as 'moderator' | 'scout' | 'viewer')}
                      >
                        {myRole === 'owner' && <option value="moderator">Mod</option>}
                        <option value="scout">Scout</option>
                        <option value="viewer">Viewer</option>
                      </select>

                      {/* Ban with confirmation */}
                      {validConfirmBan === m.inviteToken ? (
                        <>
                          <span className="text-red-400 text-[10px]">Ban?</span>
                          <button
                            onClick={() => { onBanMember(m.inviteToken!); setConfirmBan(null); }}
                            className="text-red-500 hover:text-red-400 text-[10px] font-medium transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmBan(null)}
                            className="text-gray-400 hover:text-gray-200 text-[10px] transition-colors"
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmBan(m.inviteToken!)}
                          className="text-red-500 hover:text-red-400 text-[10px] transition-colors"
                          title={`Ban ${m.name}`}
                        >
                          Ban
                        </button>
                      )}
                    </>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Last invite feedback */}
      {lastInvite && (
        <div className={`bg-gray-700/50 rounded px-2 py-1 text-xs ${TEXT_COLOR.muted}`}>
          Invite created for <span className="text-gray-200">{lastInvite.name}</span> — use the copy button in the table above.
        </div>
      )}

      {/* Create invite form */}
      {isAdmin && (
        <form onSubmit={handleCreateInvite} className="flex items-center gap-1">
          <input
            type="text"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="Username"
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
