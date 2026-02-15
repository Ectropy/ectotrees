interface Props {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

const HEALTH_VALUES = Array.from({ length: 20 }, (_, i) => 100 - i * 5);

// Tailwind classes must be full literals for the JIT compiler to detect them.
// Each button always shows its health color; selected button goes black.
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

export function HealthButtonGrid({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {HEALTH_VALUES.map(pct => {
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
