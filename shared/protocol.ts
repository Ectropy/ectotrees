import type { WorldState, WorldStates, TreeInfoPayload, TreeFieldsPayload } from './types.ts';

export type MemberRole = 'owner' | 'moderator' | 'scout' | 'viewer';

export interface MemberInfo {
  name: string;
  role: MemberRole;
  online: boolean;
  currentWorld: number | null;
  identityToken?: string;  // included only for admin recipients
  link?: string;         // included only for admin recipients — full invite URL
}

export interface SessionSummary {
  code: string;
  name: string;
  description?: string;
  managed: boolean;
  allowViewers: boolean;
  allowOpenJoin: boolean;
  clientCount: number;
  memberCount: number;
  activeWorldCount: number;
  createdAt: number;
  lastActivityAt: number;
}

export type ClientMessage =
  | { type: 'authSession';     code: string }
  | { type: 'authIdentity';    token: string }
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
  | { type: 'kickMember'; identityToken: string }
  | { type: 'banMember'; identityToken: string }
  | { type: 'renameMember'; identityToken: string; name: string }
  | { type: 'setMemberRole'; identityToken: string; role: 'moderator' | 'scout' | 'viewer' }
  | { type: 'transferOwnership'; identityToken: string }
  | { type: 'setAllowViewers'; allow: boolean }
  | { type: 'setAllowOpenJoin'; allow: boolean }
  | { type: 'selfRegister'; name: string; selfRegisterToken: string; identityToken?: string }
  | { type: 'requestIdentityToken' }
  | { type: 'updateSessionSettings'; settings: { name?: string; description?: string; listed?: boolean } }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'authSuccess';    sessionCode: string; identityToken?: string; managed?: boolean }
  | { type: 'authError';      reason: string; code?: 'invalid' | 'expired' | 'full' | 'banned' | 'timeout' }
  | { type: 'snapshot';       worlds: WorldStates }
  | { type: 'worldUpdate';    worldId: number; state: WorldState | null; ownUpdate?: boolean; source?: { name: string; role: string } }
  | { type: 'clientCount';    count: number; scouts: number; dashboards: number; identityViewers: number; anonymousViewers: number }
  | { type: 'peerWorld';      worldId: number | null }
  | { type: 'peerScout';     connected: boolean }
  | { type: 'identity';       name: string; role: MemberRole; sessionCode: string }
  | { type: 'managedEnabled'; identityToken: string }
  | { type: 'forkInvite';   managedCode: string; inviteLink: string; initiatorName: string; expiresAt: number; selfRegisterToken?: string; identityToken?: string }
  | { type: 'forkInviteExpired' }
  | { type: 'forkCreated';  managedCode: string; identityToken: string }
  | { type: 'inviteCreated';  identityToken: string; name: string; link: string }
  | { type: 'memberJoined';   name: string; clientType: 'scout' | 'dashboard' | 'unknown' }
  | { type: 'memberLeft';     name: string; clientType: 'scout' | 'dashboard' | 'unknown' }
  | { type: 'memberList';     members: MemberInfo[] }
  | { type: 'kicked' }
  | { type: 'banned';         reason: string }
  | { type: 'allowViewers';    allow: boolean }
  | { type: 'allowOpenJoin';  allow: boolean }
  | { type: 'identityToken';  token: string }
  | { type: 'selfRegistered'; identityToken: string }
  | { type: 'redirect';       code: string }
  | { type: 'sessionSettingsUpdated'; name: string | null; description: string | null; listed: boolean }
  | { type: 'pong' }
  | { type: 'ack';            msgId: number }
  | { type: 'error';          message: string; serverVersion?: string }
  | { type: 'sessionClosed';  reason: string };
