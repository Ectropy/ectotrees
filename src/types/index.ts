export type {
  TreeType,
  WorldState,
  WorldStates,
  TreeInfoPayload,
  TreeFieldsPayload,
} from '../../shared/types.ts';

export interface WorldConfig {
  id: number;
  type: 'P2P' | 'F2P';
  /** Present only on Leagues worlds. Orthogonal to `type` — Leagues has both P2P and F2P worlds. */
  leagues?: boolean;
}
