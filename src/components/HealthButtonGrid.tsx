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
  50: 'bg-transparent border border-amber-500 text-amber-500 hover:bg-amber-500/20',
  25: 'bg-transparent border border-red-500 text-red-500 hover:bg-red-500/20',
};

const LIGHTNING_SELECTED = 'bg-gray-950 text-white ring-2 ring-white/60';

const HEALTH_COLORS: Record<number, string> = {
  100: 'bg-green-600 text-white',
  95:  'bg-green-500 text-white',
  90:  'bg-green-500/80 text-white',
  85:  'bg-emerald-500 text-white',
  80:  'bg-emerald-500/80 text-white',
  75:  'bg-lime-600 text-white',
  70:  'bg-lime-600/80 text-white',
  65:  'bg-yellow-500 text-gray-900',
  60:  'bg-yellow-500/80 text-gray-900',
  55:  'bg-yellow-600 text-white',
  50:  'bg-amber-500 text-gray-900',
  45:  'bg-amber-600 text-white',
  40:  'bg-orange-500 text-white',
  35:  'bg-orange-600 text-white',
  30:  'bg-orange-700 text-white',
  25:  'bg-red-500 text-white',
  20:  'bg-red-600 text-white',
  15:  'bg-red-700 text-white',
  10:  'bg-red-800 text-white',
  5:   'bg-red-900 text-white',
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
