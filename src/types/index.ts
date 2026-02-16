export type {
  TreeType,
  WorldState,
  WorldStates,
  TreeInfoPayload,
  TreeFieldsPayload,
  SpawnTreeInfo,
} from '../../shared/types.ts';

export interface WorldConfig {
  id: number;
  type: 'P2P' | 'F2P';
}
