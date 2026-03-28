import type { WorldState, WorldStates, TreeInfoPayload, TreeFieldsPayload } from './types.ts';

export type MemberRole = 'owner' | 'moderator' | 'scout' | 'viewer';

export interface MemberInfo {
  name: string;
  role: MemberRole;
  online: boolean;
  currentWorld: number | null;
  inviteToken?: string;  // included only for admin recipients
  link?: string;         // included only for admin recipients — full invite URL
}

export interface SessionSummary {
  code: string;
  name: string;
  description?: string;
  managed: boolean;
  clientCount: number;
  memberCount: number;
  activeWorldCount: number;
  createdAt: number;
  lastActivityAt: number;
}

export type ClientMessage =
  | { type: 'authSession';     code: string }
  | { type: 'authInvite';      token: string }
  | { type: 'authPersonal';    token: string }
  | { type: 'setSpawnTimer';    worldId: number; msFromNow: number; treeInfo?: { treeHint?: string }; msgId?: number }
  | { type: 'setTreeInfo';      worldId: number; info: TreeInfoPayload; msgId?: number }
  | { type: 'updateTreeFields'; worldId: number; fields: TreeFieldsPayload; msgId?: number }
  | { type: 'updateHealth';     worldId: number; health: number | undefined; msgId?: number }
  | { type: 'reportLightning';  worldId: number; health: 50 | 25; msgId?: number }
  | { type: 'markDead';         worldId: number; msgId?: number }
  | { type: 'clearWorld';       worldId: number; msgId?: number }
  | { type: 'contributeWorlds'; worlds: WorldStates; msgId?: number }
  | { type: 'initializeState'; worlds: WorldStates }
  | { type: 'identify'; clientType: 'scout' | 'dashboard' }
  | { type: 'reportWorld'; worldId: number | null }
  | { type: 'forkToManaged'; name: string }
  | { type: 'createInvite'; name: string; role?: 'scout' | 'viewer' }
  | { type: 'banMember'; inviteToken: string }
  | { type: 'renameMember'; inviteToken: string; name: string }
  | { type: 'setMemberRole'; inviteToken: string; role: 'moderator' | 'scout' | 'viewer' }
  | { type: 'transferOwnership'; inviteToken: string }
  | { type: 'setAllowViewers'; allow: boolean }
  | { type: 'selfRegister'; name: string; selfRegisterToken: string; personalToken?: string }
  | { type: 'requestPersonalToken' }
  | { type: 'updateSessionSettings'; settings: { name?: string; description?: string; listed?: boolean } }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'authSuccess';    sessionCode: string; personalToken?: string }
  | { type: 'authError';      reason: string; code?: 'invalid' | 'expired' | 'full' | 'banned' | 'timeout' }
  | { type: 'snapshot';       worlds: WorldStates }
  | { type: 'worldUpdate';    worldId: number; state: WorldState | null; source?: string | { name: string; role: string } }
  | { type: 'clientCount';    count: number; scouts: number; dashboards: number }
  | { type: 'peerWorld';      worldId: number | null }
  | { type: 'identity';       name: string; role: MemberRole; sessionCode: string }
  | { type: 'managedEnabled'; ownerToken: string }
  | { type: 'forkInvite';   managedCode: string; inviteLink: string; initiatorName: string; expiresAt: number; selfRegisterToken?: string; personalToken?: string }
  | { type: 'forkInviteExpired' }
  | { type: 'forkCreated';  managedCode: string; ownerToken: string }
  | { type: 'inviteCreated';  inviteToken: string; name: string; link: string }
  | { type: 'memberJoined';   name: string }
  | { type: 'memberLeft';     name: string }
  | { type: 'memberList';     members: MemberInfo[] }
  | { type: 'banned';         reason: string }
  | { type: 'allowViewers';    allow: boolean }
  | { type: 'personalToken';  token: string }
  | { type: 'selfRegistered'; inviteToken: string }
  | { type: 'redirect';       code: string }
  | { type: 'sessionSettingsUpdated'; name: string | null; description: string | null; listed: boolean }
  | { type: 'pong' }
  | { type: 'ack';            msgId: number }
  | { type: 'error';          message: string; serverVersion?: string }
  | { type: 'sessionClosed';  reason: string };
