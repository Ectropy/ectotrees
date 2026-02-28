import type { WorldStates, WorldState, TreeInfoPayload, TreeFieldsPayload, SpawnTreeInfo } from './types.ts';
import { SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS, ALIVE_TREE_TYPES, LIGHTNING_1_MS, LIGHTNING_2_MS, HEALTH_LIGHTNING_1, HEALTH_LIGHTNING_2 } from './types.ts';

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
      let nextTreeType: typeof s.treeType = 'mature';
      if (s.treeType && s.treeType.startsWith('sapling-')) {
        // Extract type from 'sapling-tree' -> 'tree'
        const extractedType = s.treeType.replace('sapling-', '');
        nextTreeType = extractedType as typeof s.treeType;
      } else if (s.treeType && ALIVE_TREE_TYPES.has(s.treeType)) {
        nextTreeType = s.treeType;
      }
      s = {
        ...s,
        treeStatus: 'mature',
        treeType: nextTreeType,
        matureAt: s.treeSetAt + SAPLING_MATURE_MS,
      };
      dirty = true;
    }

    if (
      (s.treeStatus === 'mature' || s.treeStatus === 'alive') &&
      s.matureAt !== undefined &&
      now >= s.matureAt + LIGHTNING_1_MS &&
      (s.treeHealth === undefined || s.treeHealth > HEALTH_LIGHTNING_1)
    ) {
      s = { ...s, treeHealth: HEALTH_LIGHTNING_1 };
      dirty = true;
    }

    if (
      (s.treeStatus === 'mature' || s.treeStatus === 'alive') &&
      s.matureAt !== undefined &&
      now >= s.matureAt + LIGHTNING_2_MS &&
      (s.treeHealth === undefined || s.treeHealth > HEALTH_LIGHTNING_2)
    ) {
      s = { ...s, treeHealth: HEALTH_LIGHTNING_2 };
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
        treeHealth: undefined,
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
      treeExactLocation: treeInfo?.treeExactLocation,
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
  const isSapling = info.treeType === 'sapling' || info.treeType.startsWith('sapling-');
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
  now: number,
): WorldStates {
  const current = states[worldId];
  if (!current) return states;

  let nextStatus = current.treeStatus;
  let matureAtOverride: number | undefined;

  if (fields.treeType !== undefined) {
    if (current.treeStatus === 'sapling') {
      // Manually advancing a sapling to a mature/alive type: reset matureAt to now
      if (ALIVE_TREE_TYPES.has(fields.treeType)) {
        nextStatus = 'alive';
        matureAtOverride = now;
      } else if (fields.treeType === 'mature') {
        nextStatus = 'mature';
        matureAtOverride = now;
      }
    } else if (
      ALIVE_TREE_TYPES.has(fields.treeType) &&
      current.treeStatus === 'mature'
    ) {
      // mature → alive: preserve matureAt (set correctly by auto-transition)
      nextStatus = 'alive';
    }
  }

  return {
    ...states,
    [worldId]: {
      ...current,
      ...fields,
      ...(matureAtOverride !== undefined ? { matureAt: matureAtOverride } : {}),
      treeStatus: nextStatus,
    },
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
      treeHealth: undefined,
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

export function applyReportLightning(
  states: WorldStates,
  worldId: number,
  health: 50 | 25,
  now: number,
): WorldStates {
  const current = states[worldId];
  if (!current || (current.treeStatus !== 'mature' && current.treeStatus !== 'alive')) {
    return states;
  }
  const matureAt = health === 50
    ? now - LIGHTNING_1_MS  // 10 min ago → dies in 20 min
    : now - LIGHTNING_2_MS; // 20 min ago → dies in 10 min
  return {
    ...states,
    [worldId]: { ...current, treeHealth: health, matureAt },
  };
}
