import type { WorldStates, WorldState, TreeInfoPayload, TreeFieldsPayload, SpawnTreeInfo } from './types.ts';
import { SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS, ALIVE_TREE_TYPES } from './types.ts';

export function applyTransitions(states: WorldStates, now: number): WorldStates {
  let changed = false;
  const next = { ...states };

  for (const [key, ws] of Object.entries(states)) {
    const id = Number(key);
    let s: WorldState = { ...ws };
    let dirty = false;

    if (
      s.treeStatus === 'sapling' &&
      s.treeSetAt !== undefined &&
      now >= s.treeSetAt + SAPLING_MATURE_MS
    ) {
      s = {
        ...s,
        treeStatus: 'mature',
        treeType: (s.treeType && ALIVE_TREE_TYPES.has(s.treeType)) ? s.treeType : 'mature',
        matureAt: s.treeSetAt + SAPLING_MATURE_MS,
      };
      dirty = true;
    }

    if (
      (s.treeStatus === 'mature' || s.treeStatus === 'alive') &&
      s.matureAt !== undefined &&
      now >= s.matureAt + ALIVE_DEAD_MS
    ) {
      s = {
        ...s,
        treeStatus: 'dead',
        deadAt: s.matureAt + ALIVE_DEAD_MS,
        nextSpawnTarget: undefined,
        spawnSetAt: undefined,
      };
      dirty = true;
    }

    if (
      s.treeStatus === 'dead' &&
      s.deadAt !== undefined &&
      now >= s.deadAt + DEAD_CLEAR_MS
    ) {
      s = { treeStatus: 'none' };
      dirty = true;
    }

    if (
      s.nextSpawnTarget !== undefined &&
      now >= s.nextSpawnTarget
    ) {
      s = {
        ...s,
        treeStatus: 'sapling',
        treeType: 'sapling',
        treeSetAt: s.nextSpawnTarget,
        matureAt: s.nextSpawnTarget + SAPLING_MATURE_MS,
        nextSpawnTarget: undefined,
        spawnSetAt: undefined,
      };
      dirty = true;
    }

    if (dirty) {
      next[id] = s;
      changed = true;
    }
  }

  return changed ? next : states;
}

export function applySetSpawnTimer(
  states: WorldStates,
  worldId: number,
  msFromNow: number,
  now: number,
  treeInfo?: SpawnTreeInfo,
): WorldStates {
  return {
    ...states,
    [worldId]: {
      treeStatus: 'none',
      nextSpawnTarget: now + msFromNow,
      spawnSetAt: now,
      treeHint: treeInfo?.treeHint,
    },
  };
}

export function applySetTreeInfo(
  states: WorldStates,
  worldId: number,
  info: TreeInfoPayload,
  now: number,
): WorldStates {
  const current = states[worldId] ?? { treeStatus: 'none' as const };
  const isSapling = info.treeType === 'sapling';
  const isMatureUnknown = info.treeType === 'mature';
  return {
    ...states,
    [worldId]: {
      ...current,
      treeType: info.treeType,
      treeHint: info.treeHint,
      treeExactLocation: info.treeExactLocation,
      treeHealth: info.treeHealth,
      treeSetAt: now,
      matureAt: isSapling ? now + SAPLING_MATURE_MS : now,
      treeStatus: isSapling ? 'sapling' : isMatureUnknown ? 'mature' : 'alive',
      deadAt: undefined,
      nextSpawnTarget: undefined,
      spawnSetAt: undefined,
    },
  };
}

export function applyUpdateTreeFields(
  states: WorldStates,
  worldId: number,
  fields: TreeFieldsPayload,
): WorldStates {
  const current = states[worldId];
  if (!current) return states;

  let nextStatus = current.treeStatus;
  if (
    fields.treeType !== undefined &&
    ALIVE_TREE_TYPES.has(fields.treeType) &&
    (current.treeStatus === 'sapling' || current.treeStatus === 'mature')
  ) {
    nextStatus = 'alive';
  }

  return {
    ...states,
    [worldId]: { ...current, ...fields, treeStatus: nextStatus },
  };
}

export function applyUpdateHealth(
  states: WorldStates,
  worldId: number,
  health: number | undefined,
): WorldStates {
  const current = states[worldId];
  if (!current) return states;
  return { ...states, [worldId]: { ...current, treeHealth: health } };
}

export function applyMarkDead(
  states: WorldStates,
  worldId: number,
  now: number,
): WorldStates {
  const current = states[worldId] ?? { treeStatus: 'none' as const };
  return {
    ...states,
    [worldId]: {
      ...current,
      treeStatus: 'dead',
      deadAt: now,
      nextSpawnTarget: undefined,
      spawnSetAt: undefined,
    },
  };
}

export function applyClearWorld(
  states: WorldStates,
  worldId: number,
): WorldStates {
  const next = { ...states };
  delete next[worldId];
  return next;
}
