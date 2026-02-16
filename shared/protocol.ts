import type { WorldState, WorldStates, TreeInfoPayload, TreeFieldsPayload } from './types.ts';

export type ClientMessage =
  | { type: 'setSpawnTimer';    worldId: number; msFromNow: number; treeInfo?: { treeHint?: string } }
  | { type: 'setTreeInfo';      worldId: number; info: TreeInfoPayload }
  | { type: 'updateTreeFields'; worldId: number; fields: TreeFieldsPayload }
  | { type: 'updateHealth';     worldId: number; health: number | undefined }
  | { type: 'markDead';         worldId: number }
  | { type: 'clearWorld';       worldId: number }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'snapshot';       worlds: WorldStates }
  | { type: 'worldUpdate';    worldId: number; state: WorldState | null }
  | { type: 'clientCount';    count: number }
  | { type: 'pong' }
  | { type: 'error';          message: string }
  | { type: 'sessionClosed';  reason: string };
