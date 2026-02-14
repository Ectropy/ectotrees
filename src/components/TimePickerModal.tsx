import { useState } from 'react';

interface Props {
  onSubmit: (totalMs: number) => void;
  onClose: () => void;
}

export function TimePickerModal({ onSubmit, onClose }: Props) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const totalMs = ((hours * 60) + minutes) * 60 * 1000;
    if (totalMs <= 0) return;
    onSubmit(totalMs);
    onClose();
  }

  return (
    <div
      className="absolute z-50 top-full mt-1 lg:top-auto lg:bottom-full lg:mt-0 lg:mb-1 bg-gray-700 border border-gray-500
        rounded shadow-xl p-2 w-44"
      onClick={e => e.stopPropagation()}
    >
      <div className="text-xs text-gray-200 font-semibold mb-1.5">Next spawn in:</div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-gray-400 w-8">Hours</label>
          <input
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={e => setHours(Math.max(0, Math.min(23, Number(e.target.value))))}
            className="w-14 bg-gray-600 text-white text-xs rounded px-1.5 py-0.5 border border-gray-500 focus:outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-gray-400 w-8">Mins</label>
          <input
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={e => setMinutes(Math.max(0, Math.min(59, Number(e.target.value))))}
            className="w-14 bg-gray-600 text-white text-xs rounded px-1.5 py-0.5 border border-gray-500 focus:outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex gap-1 mt-0.5">
          <button
            type="submit"
            disabled={(hours * 60 + minutes) === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
              text-white text-xs rounded py-0.5 transition-colors"
          >
            Set
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded py-0.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
