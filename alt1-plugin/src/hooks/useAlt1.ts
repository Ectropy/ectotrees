import { useMemo } from 'react';
import { scanSpiritTreeDialog, scanWorldFromFriendsList } from '../scanner';
import { parseSpawnTime, parseHint, msToHoursMinutes } from '../parser';

export interface Alt1State {
  isAlt1: boolean;
  hasPixel: boolean;
  hasGameState: boolean;
}

export interface DialogScan {
  hours: number;
  minutes: number;
  hint: string | null;
  rawText: string;
}

export interface WorldScan {
  world: number;
  method: 'gamestate' | 'ocr';
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

    if (ms === null && hint === null) return null;

    const { hours, minutes } = ms !== null ? msToHoursMinutes(ms) : { hours: 0, minutes: 0 };
    return { hours, minutes, hint, rawText };
  }

  return { ...state, scanWorld, scanDialog };
}
