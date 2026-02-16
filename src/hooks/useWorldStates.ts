import { useState, useEffect, useCallback } from 'react';
import type { WorldStates, TreeInfoPayload, TreeFieldsPayload, SpawnTreeInfo } from '../types';
import type { SyncChannel } from './useSession';
import {
  applyTransitions,
  applySetSpawnTimer,
  applySetTreeInfo,
  applyUpdateTreeFields,
  applyUpdateHealth,
  applyMarkDead,
  applyClearWorld,
} from '../../shared/mutations.ts';

const STORAGE_KEY = 'evilTree_worldStates';

export function useWorldStates(sync?: SyncChannel | null) {
  const [worldStates, setWorldStates] = useState<WorldStates>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WorldStates;
    } catch {
      return {};
    }
  });

  const [tick, setTick] = useState(0);

  // localStorage persistence: only in local-only mode
  useEffect(() => {
    if (sync) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(worldStates));
    } catch {
      // ignore storage errors
    }
  }, [worldStates, sync]);

  // Subscribe to incoming sync updates
  useEffect(() => {
    if (!sync) return;
    return sync.subscribe({
      onSnapshot: (states) => setWorldStates(states),
      onWorldUpdate: (worldId, state) => {
        setWorldStates(prev => {
          if (state === null) {
            const next = { ...prev };
            delete next[worldId];
            return next;
          }
          return { ...prev, [worldId]: state };
        });
      },
    });
  }, [sync]);

  // Auto-transitions timer
  useEffect(() => {
    const id = setInterval(() => {
      setWorldStates(prev => applyTransitions(prev, Date.now()));
      setTick(t => t + 1);
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  const setSpawnTimer = useCallback((worldId: number, msFromNow: number, treeInfo?: SpawnTreeInfo) => {
    setWorldStates(prev => applySetSpawnTimer(prev, worldId, msFromNow, Date.now(), treeInfo));
    sync?.sendMutation({ type: 'setSpawnTimer', worldId, msFromNow, treeInfo });
  }, [sync]);

  const setTreeInfo = useCallback((worldId: number, info: TreeInfoPayload) => {
    setWorldStates(prev => applySetTreeInfo(prev, worldId, info, Date.now()));
    sync?.sendMutation({ type: 'setTreeInfo', worldId, info });
  }, [sync]);

  const updateHealth = useCallback((worldId: number, health: number | undefined) => {
    setWorldStates(prev => applyUpdateHealth(prev, worldId, health));
    sync?.sendMutation({ type: 'updateHealth', worldId, health });
  }, [sync]);

  const updateTreeFields = useCallback((worldId: number, fields: TreeFieldsPayload) => {
    setWorldStates(prev => applyUpdateTreeFields(prev, worldId, fields));
    sync?.sendMutation({ type: 'updateTreeFields', worldId, fields });
  }, [sync]);

  const markDead = useCallback((worldId: number) => {
    setWorldStates(prev => applyMarkDead(prev, worldId, Date.now()));
    sync?.sendMutation({ type: 'markDead', worldId });
  }, [sync]);

  const clearWorld = useCallback((worldId: number) => {
    setWorldStates(prev => applyClearWorld(prev, worldId));
    sync?.sendMutation({ type: 'clearWorld', worldId });
  }, [sync]);

  // Save current state to localStorage (call when leaving a session)
  const saveToLocalStorage = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(worldStates));
    } catch { /* ignore */ }
  }, [worldStates]);

  return { worldStates, setSpawnTimer, setTreeInfo, updateTreeFields, updateHealth, markDead, clearWorld, tick, saveToLocalStorage };
}
