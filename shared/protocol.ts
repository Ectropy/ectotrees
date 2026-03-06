import type { WorldState, WorldStates, TreeInfoPayload, TreeFieldsPayload } from './types.ts';

export type ClientMessage =
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
  | { type: 'requestPairToken' }
  | { type: 'resumePair'; pairId: string }
  | { type: 'reportWorld'; worldId: number | null }
  | { type: 'unpair' }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'snapshot';       worlds: WorldStates }
  | { type: 'worldUpdate';    worldId: number; state: WorldState | null; source?: string }
  | { type: 'clientCount';    count: number; scouts: number; dashboards: number }
  | { type: 'pairToken';      token: string; expiresIn: number }
  | { type: 'paired';         pairId: string; sessionCode: string }
  | { type: 'unpaired';       reason: string }
  | { type: 'peerWorld';      worldId: number | null }
  | { type: 'pong' }
  | { type: 'ack';            msgId: number }
  | { type: 'error';          message: string }
  | { type: 'sessionClosed';  reason: string };
