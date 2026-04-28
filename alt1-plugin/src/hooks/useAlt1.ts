import { useMemo } from 'react';
import { scanSpiritTreeDialog, scanWorldFromFriendsList } from '../scanner';
import {
  parseSpawnTime,
  parseHint,
  parseGreetingMode,
  parsePostSpawnLocation,
  parseSentinelTreeType,
  parseTreeDead,
  msToHoursMinutes,
} from '../parser';
import type { TreeType } from '@shared/types';

export interface Alt1State {
  isAlt1: boolean;
  hasPixel: boolean;
  hasGameState: boolean;
}

export interface DialogScan {
  hours: number;
  minutes: number;
  hint: string | null;
  exactLocation: string | null;
  treeType: TreeType | null;
  greetingMode: 'prespawn' | 'postspawn' | null;
  treeDied: boolean;
  rawText: string;
}

export interface WorldScan {
  world: number;
  method: 'gamestate';
}

export function useAlt1() {
  const state = useMemo<Alt1State>(() => {
    const isAlt1 = typeof alt1 !== 'undefined';
    return {
      isAlt1,
      hasPixel: isAlt1 && alt1.permissionPixel,
      hasGameState: isAlt1 && alt1.permissionGameState,
    };
  }, []);

  function scanWorld(): WorldScan | null {
    return scanWorldFromFriendsList();
  }

  function scanDialog(): DialogScan | null {
    const result = scanSpiritTreeDialog();
    if (!result) return null;

    const { rawText } = result;
    const ms = parseSpawnTime(rawText);
    const hint = parseHint(rawText);
    const exactLocation = parsePostSpawnLocation(rawText);
    const treeType = parseSentinelTreeType(rawText);
    const greetingMode = parseGreetingMode(rawText);
    const treeDied = parseTreeDead(rawText);

    if (
      ms === null &&
      hint === null &&
      exactLocation === null &&
      treeType === null &&
      greetingMode === null &&
      !treeDied
    ) return null;

    const { hours, minutes } = ms !== null ? msToHoursMinutes(ms) : { hours: 0, minutes: 0 };
    return { hours, minutes, hint, exactLocation, treeType, greetingMode, treeDied, rawText };
  }

  return { ...state, scanWorld, scanDialog };
}
