import type { WorldState, WorldStates, TreeInfoPayload, TreeFieldsPayload } from './types.ts';

export type ClientMessage =
  | { type: 'setSpawnTimer';    worldId: number; msFromNow: number; treeInfo?: { treeHint?: string }; msgId?: number }
  | { type: 'setTreeInfo';      worldId: number; info: TreeInfoPayload; msgId?: number }
  | { type: 'updateTreeFields'; worldId: number; fields: TreeFieldsPayload; msgId?: number }
  | { type: 'updateHealth';     worldId: number; health: number | undefined; msgId?: number }
  | { type: 'markDead';         worldId: number; msgId?: number }
  | { type: 'clearWorld';       worldId: number; msgId?: number }
  | { type: 'initializeState'; worlds: WorldStates }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'snapshot';       worlds: WorldStates }
  | { type: 'worldUpdate';    worldId: number; state: WorldState | null }
  | { type: 'clientCount';    count: number }
  | { type: 'pong' }
  | { type: 'ack';            msgId: number }
  | { type: 'error';          message: string }
  | { type: 'sessionClosed';  reason: string };
