import { useState, useEffect, useCallback } from 'react';

export interface AppSettings {
  effectsLightning: boolean;
  effectsSparks: boolean;
  showTipTicker: boolean;
  sidebarEnabled: boolean;
  sidebarSide: 'left' | 'right';
  followScout: boolean;
}

const STORAGE_KEY = 'evilTree_settings';
const DEFAULTS: AppSettings = {
  effectsLightning: true,
  effectsSparks: true,
  showTipTicker: true,
  sidebarEnabled: false,
  sidebarSide: 'right',
  followScout: false,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    if (typeof p?.effectsLightning !== 'boolean' || typeof p?.effectsSparks !== 'boolean')
      return DEFAULTS;
    return {
      effectsLightning: p.effectsLightning,
      effectsSparks: p.effectsSparks,
      // Graceful migration: existing stored settings won't have these fields
      showTipTicker: typeof p?.showTipTicker === 'boolean' ? p.showTipTicker : true,
      sidebarEnabled: typeof p?.sidebarEnabled === 'boolean' ? p.sidebarEnabled : false,
      sidebarSide: p?.sidebarSide === 'left' ? 'left' : 'right',
      followScout: typeof p?.followScout === 'boolean' ? p.followScout : false,
    };
  } catch { return DEFAULTS; }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  return { settings, updateSettings } as const;
}
