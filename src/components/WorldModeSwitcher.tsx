import { Sparkles } from 'lucide-react';
import { CHIP_COLOR, LEAGUES_COLOR, FOCUS_RING } from '../constants/toolColors';
import type { WorldMode } from '../lib/worldMode';

interface Props {
  mode: WorldMode;
  setMode: (mode: WorldMode) => void;
  leaguesCount: number;
  /** False until the user has opened Leagues once; drives the attention dot. */
  seen: boolean;
}

const BUTTON_BASE = `px-2 py-1 sm:px-1.5 sm:py-0.5 text-xs sm:text-[11px] rounded transition-colors text-center inline-flex items-center gap-1 ${FOCUS_RING}`;

/**
 * Main / Leagues mode switcher.
 *
 * Renders nothing when there are no Leagues worlds configured, so the feature can
 * ship dark before the event and disappear cleanly afterwards by deleting the
 * entries from worlds.json — no code change either way.
 */
export function WorldModeSwitcher({ mode, setMode, leaguesCount, seen }: Props) {
  if (leaguesCount === 0) return null;

  return (
    <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="World set">
      <button
        onClick={() => setMode('main')}
        aria-pressed={mode === 'main'}
        className={`${BUTTON_BASE} ${mode === 'main' ? CHIP_COLOR.active : CHIP_COLOR.inactive}`}
      >
        Main
      </button>
      <button
        onClick={() => setMode('leagues')}
        aria-pressed={mode === 'leagues'}
        title={`Leagues worlds (${leaguesCount})`}
        className={`${BUTTON_BASE} ${mode === 'leagues' ? LEAGUES_COLOR.active : LEAGUES_COLOR.inactive}`}
      >
        {/* Pulse the dot rather than the whole button: noticeable without nagging,
            and it retires permanently once the user has been to Leagues. */}
        {!seen && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEAGUES_COLOR.dot}`} />}
        <Sparkles className="h-3 w-3 shrink-0" />
        Leagues
      </button>
    </div>
  );
}
