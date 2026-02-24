import { useState, useEffect, useCallback } from 'react';

export interface AppSettings {
  effectsLightning: boolean;
  effectsSparks: boolean;
}

const STORAGE_KEY = 'evilTree_settings';
const DEFAULTS: AppSettings = { effectsLightning: true, effectsSparks: true };

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    if (typeof p?.effectsLightning !== 'boolean' || typeof p?.effectsSparks !== 'boolean')
      return DEFAULTS;
    return { effectsLightning: p.effectsLightning, effectsSparks: p.effectsSparks };
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
