import { useState, useEffect, useCallback } from 'react';
import type { WorldStates, WorldState, TreeInfoPayload, SpawnTreeInfo } from '../types';
import { SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS } from '../constants/evilTree';

const STORAGE_KEY = 'evilTree_worldStates';

function applyTransitions(states: WorldStates, now: number): WorldStates {
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
      s = { ...s, treeStatus: 'mature', matureAt: s.treeSetAt + SAPLING_MATURE_MS };
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

    // When a spawn timer elapses, convert it into a Strange Sapling.
    // Use the recorded `nextSpawnTarget` timestamp for deterministic timing
    // and clear the spawn timer fields to preserve invariants.
    if (
      s.nextSpawnTarget !== undefined &&
      now >= s.nextSpawnTarget
    ) {
      s = {
        ...s,
        treeStatus: 'sapling',
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

export function useWorldStates() {
  const [worldStates, setWorldStates] = useState<WorldStates>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WorldStates;
    } catch {
      return {};
    }
  });

  const [tick, setTick] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(worldStates));
    } catch {
      // ignore storage errors
    }
  }, [worldStates]);

  useEffect(() => {
    const id = setInterval(() => {
      setWorldStates(prev => applyTransitions(prev, Date.now()));
      setTick(t => t + 1);
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  const setSpawnTimer = useCallback((worldId: number, msFromNow: number, treeInfo?: SpawnTreeInfo) => {
    const now = Date.now();
    setWorldStates(prev => ({
      ...prev,
      [worldId]: {
        treeStatus: 'none',
        nextSpawnTarget: now + msFromNow,
        spawnSetAt: now,
        treeHint: treeInfo?.treeHint,
        treeExactLocation: treeInfo?.treeExactLocation,
      },
    }));
  }, []);

  const setTreeInfo = useCallback((worldId: number, info: TreeInfoPayload) => {
    const now = Date.now();
    setWorldStates(prev => {
      const current = prev[worldId] ?? { treeStatus: 'none' };
      const isSapling = info.treeType === 'sapling';
      const isMatureUnknown = info.treeType === 'mature';
      return {
        ...prev,
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
    });
  }, []);

  const updateHealth = useCallback((worldId: number, health: number | undefined) => {
    setWorldStates(prev => {
      const current = prev[worldId];
      if (!current) return prev;
      return { ...prev, [worldId]: { ...current, treeHealth: health } };
    });
  }, []);

  const markDead = useCallback((worldId: number) => {
    setWorldStates(prev => {
      const current = prev[worldId] ?? { treeStatus: 'none' };
      return {
        ...prev,
        [worldId]: {
          ...current,
          treeStatus: 'dead',
          deadAt: Date.now(),
          nextSpawnTarget: undefined,
          spawnSetAt: undefined,
        },
      };
    });
  }, []);

  const clearWorld = useCallback((worldId: number) => {
    setWorldStates(prev => {
      const next = { ...prev };
      delete next[worldId];
      return next;
    });
  }, []);

  return { worldStates, setSpawnTimer, setTreeInfo, updateHealth, markDead, clearWorld, tick };
}
