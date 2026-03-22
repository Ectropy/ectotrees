import { Zap } from 'lucide-react';

interface Props {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  onLightning?: (value: 50 | 25) => void;
  selectedLightning?: 50 | 25;
}

const HEALTH_VALUES = Array.from({ length: 20 }, (_, i) => 100 - i * 5);

// Tailwind classes must be full literals for the JIT compiler to detect them.
// Each button always shows its health color; selected button goes black.
const LIGHTNING_COLORS: Record<50 | 25, string> = {
  50: 'bg-transparent border border-amber-500 text-white hover:bg-amber-500/20',
  25: 'bg-transparent border border-red-500 text-white hover:bg-red-500/20',
};

const LIGHTNING_SELECTED = 'bg-gray-950 text-white ring-2 ring-white/60';

const HEALTH_COLORS: Record<number, string> = {
  100: 'bg-transparent border border-green-600 text-white hover:bg-green-600/20',
  95:  'bg-transparent border border-green-500 text-white hover:bg-green-500/20',
  90:  'bg-transparent border border-green-400 text-white hover:bg-green-400/20',
  85:  'bg-transparent border border-emerald-500 text-white hover:bg-emerald-500/20',
  80:  'bg-transparent border border-emerald-400 text-white hover:bg-emerald-400/20',
  75:  'bg-transparent border border-lime-600 text-white hover:bg-lime-600/20',
  70:  'bg-transparent border border-lime-500 text-white hover:bg-lime-500/20',
  65:  'bg-transparent border border-yellow-500 text-white hover:bg-yellow-500/20',
  60:  'bg-transparent border border-yellow-400 text-white hover:bg-yellow-400/20',
  55:  'bg-transparent border border-yellow-600 text-white hover:bg-yellow-600/20',
  50:  'bg-transparent border border-amber-500 text-white hover:bg-amber-500/20',
  45:  'bg-transparent border border-amber-600 text-white hover:bg-amber-600/20',
  40:  'bg-transparent border border-orange-500 text-white hover:bg-orange-500/20',
  35:  'bg-transparent border border-orange-600 text-white hover:bg-orange-600/20',
  30:  'bg-transparent border border-orange-700 text-white hover:bg-orange-700/20',
  25:  'bg-transparent border border-red-500 text-white hover:bg-red-500/20',
  20:  'bg-transparent border border-red-600 text-white hover:bg-red-600/20',
  15:  'bg-transparent border border-red-700 text-white hover:bg-red-700/20',
  10:  'bg-transparent border border-red-800 text-white hover:bg-red-800/20',
  5:   'bg-transparent border border-red-900 text-white hover:bg-red-900/20',
};

type GridItem = number | { lightning: 50 | 25 };

export function HealthButtonGrid({ value, onChange, onLightning, selectedLightning }: Props) {
  const items: GridItem[] = [];
  for (const pct of HEALTH_VALUES) {
    if (onLightning && (pct === 50 || pct === 25)) {
      items.push({ lightning: pct });
    }
    items.push(pct);
  }

  return (
    <div className="grid grid-cols-5 gap-1.5">
      {items.map(item => {
        if (typeof item === 'object') {
          const { lightning: pct } = item;
          return (
            <button
              key={`lightning-${pct}`}
              type="button"
              onClick={() => onLightning!(pct)}
              className={`col-span-5 text-xs py-2 px-3 rounded transition-colors flex items-center justify-center gap-1.5 ${selectedLightning === pct ? LIGHTNING_SELECTED : LIGHTNING_COLORS[pct]}`}
            >
              <Zap className="h-3.5 w-3.5 flex-shrink-0" />
              Report {pct}% lightning strike
            </button>
          );
        }

        const pct = item;
        const isSelected = value === pct;
        return (
          <button
            key={pct}
            type="button"
            onClick={() => onChange(isSelected ? undefined : pct)}
            className={`text-xs font-medium rounded py-1.5 transition-colors ${
              isSelected
                ? 'bg-gray-950 text-white ring-2 ring-white/60'
                : HEALTH_COLORS[pct]
            }`}
          >
            {pct}%
          </button>
        );
      })}
    </div>
  );
}
