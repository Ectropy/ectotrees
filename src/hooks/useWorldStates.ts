import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import type { WorldStates, TreeInfoPayload, TreeFieldsPayload, SpawnTreeInfo } from '../types';
import { HEALTH_LIGHTNING_1, HEALTH_LIGHTNING_2 } from '../../shared/types.ts';
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

export type LightningKind = 'lightning1' | 'lightning2' | 'death';

interface LightningEvent {
  kind: LightningKind;
  seq: number;
}

export function useWorldStates(sync?: SyncChannel | null) {
  const [worldStates, setWorldStates] = useState<WorldStates>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as WorldStates;
    } catch {
      return {};
    }
  });

  const [tick, setTick] = useState(0);

  const pendingLightningRef = useRef<Array<{ worldId: number; kind: LightningKind }>>([]);
  const lightningSeqRef = useRef(0);
  const [lightningEvents, setLightningEvents] = useState<Map<number, LightningEvent>>(() => new Map());

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
      setWorldStates(prev => {
        const now = Date.now();
        const next = applyTransitions(prev, now);
        if (next !== prev) {
          for (const [key, nextState] of Object.entries(next)) {
            const worldId = Number(key);
            const oldState = prev[worldId];
            if (!oldState || oldState === nextState) continue;

            // Death supersedes health events for the same world in the same tick
            if (
              nextState.treeStatus === 'dead' &&
              (oldState.treeStatus === 'mature' || oldState.treeStatus === 'alive')
            ) {
              pendingLightningRef.current.push({ worldId, kind: 'death' });
              continue;
            }
            // Lightning 2: health auto-capped to 25%
            if (
              nextState.treeHealth === HEALTH_LIGHTNING_2 &&
              (oldState.treeHealth === undefined || oldState.treeHealth > HEALTH_LIGHTNING_2)
            ) {
              pendingLightningRef.current.push({ worldId, kind: 'lightning2' });
              continue;
            }
            // Lightning 1: health auto-capped to 50%
            if (
              nextState.treeHealth === HEALTH_LIGHTNING_1 &&
              (oldState.treeHealth === undefined || oldState.treeHealth > HEALTH_LIGHTNING_1)
            ) {
              pendingLightningRef.current.push({ worldId, kind: 'lightning1' });
            }
          }
        }
        return next;
      });
      setTick(t => t + 1);
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  // Flush pending lightning events from the ref into React state after every commit.
  // useLayoutEffect (no deps) fires synchronously after the DOM is committed.
  useLayoutEffect(() => {
    if (pendingLightningRef.current.length === 0) return;
    const pending = pendingLightningRef.current.splice(0);
    setLightningEvents(prev => {
      const next = new Map(prev);
      for (const { worldId, kind } of pending) {
        const seq = ++lightningSeqRef.current;
        next.set(worldId, { kind, seq });
        // Fallback cleanup if the card is filtered/hidden and never calls onComplete
        setTimeout(() => {
          setLightningEvents(m => {
            const cur = m.get(worldId);
            if (cur?.seq === seq) {
              const cleaned = new Map(m);
              cleaned.delete(worldId);
              return cleaned;
            }
            return m;
          });
        }, 3_000);
      }
      return next;
    });
  });

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

  const dismissLightningEvent = useCallback((worldId: number) => {
    setLightningEvents(prev => {
      if (!prev.has(worldId)) return prev;
      const next = new Map(prev);
      next.delete(worldId);
      return next;
    });
  }, []);

  const triggerLightningEvent = useCallback((worldId: number, kind: LightningKind = 'lightning1') => {
    setLightningEvents(prev => {
      const seq = ++lightningSeqRef.current;
      const next = new Map(prev);
      next.set(worldId, { kind, seq });
      setTimeout(() => {
        setLightningEvents(m => {
          const cur = m.get(worldId);
          if (cur?.seq === seq) { const c = new Map(m); c.delete(worldId); return c; }
          return m;
        });
      }, 3_000);
      return next;
    });
  }, []);

  return { worldStates, setSpawnTimer, setTreeInfo, updateTreeFields, updateHealth, markDead, clearWorld, tick, saveToLocalStorage, lightningEvents, dismissLightningEvent, triggerLightningEvent };
}
