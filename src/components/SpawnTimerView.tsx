import { useState, useRef } from 'react';
import { LOCATION_HINTS } from '../constants/evilTree';
import { ScrollPicker } from './ScrollPicker';
import type { WorldConfig, SpawnTreeInfo } from '../types';

const HOUR_VALUES = Array.from({ length: 13 }, (_, i) => i);      // [0..12]
const MINUTE_VALUES = Array.from({ length: 59 }, (_, i) => i + 1); // [1..59]

function clampToValues(typed: number, values: number[]): number {
  if (values.includes(typed)) return typed;
  return values.reduce((closest, v) =>
    Math.abs(v - typed) < Math.abs(closest - typed) ? v : closest
  );
}

interface Props {
  world: WorldConfig;
  onSubmit: (msFromNow: number, treeInfo?: SpawnTreeInfo) => void;
  onBack: () => void;
}

export function SpawnTimerView({ world, onSubmit, onBack }: Props) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [hint, setHint] = useState('');
  const isP2P = world.type === 'P2P';

  const [hoursText, setHoursText] = useState('0');
  const [minutesText, setMinutesText] = useState('30');
  const hoursFocused = useRef(false);
  const minutesFocused = useRef(false);

  // Sync text fields when values change from scroll picker
  function handleHoursChange(v: number) {
    setHours(v);
    if (!hoursFocused.current) setHoursText(String(v));
  }
  function handleMinutesChange(v: number) {
    setMinutes(v);
    if (!minutesFocused.current) setMinutesText(String(v));
  }

  function commitHours() {
    const typed = parseInt(hoursText, 10);
    if (isNaN(typed) || hoursText.trim() === '') {
      setHoursText(String(hours));
      return;
    }
    const clamped = clampToValues(typed, HOUR_VALUES);
    setHours(clamped);
    setHoursText(String(clamped));
  }

  function commitMinutes() {
    const typed = parseInt(minutesText, 10);
    if (isNaN(typed) || minutesText.trim() === '') {
      setMinutesText(String(minutes));
      return;
    }
    const clamped = clampToValues(typed, MINUTE_VALUES);
    setMinutes(clamped);
    setMinutesText(String(clamped));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const totalMs = ((hours * 60) + minutes) * 60 * 1000;
    if (totalMs <= 0) return;
    const treeInfo: SpawnTreeInfo | undefined = hint
      ? { treeHint: hint }
      : undefined;
    onSubmit(totalMs, treeInfo);
  }

  const selectClass = 'w-full bg-gray-600 text-white text-sm rounded px-2 py-1.5 border border-gray-500 focus:outline-none focus:border-blue-400';
  const inputClass = 'bg-gray-600 text-white text-center text-lg font-semibold rounded px-2 py-1.5 border border-gray-500 focus:border-blue-400 focus:outline-none w-full';

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="text-sm text-blue-400 hover:text-blue-300 mb-3 transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">⏱ Set Spawn Timer</h1>
              <p className="text-sm text-gray-400">
                World {world.id} · <span className={isP2P ? 'text-yellow-200' : 'text-blue-200'}>{world.type}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Help text */}
          <div className="bg-gray-800 border border-gray-700 rounded p-4">
            <p className="text-sm text-gray-300">
              Set a timer for when the next Evil Tree should spawn.
            </p>
          </div>

          {/* Time inputs */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-200">Time until spawn</label>

            {/* Text entry row */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Hours</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={hoursText}
                  onFocus={e => { hoursFocused.current = true; e.target.select(); }}
                  onBlur={() => { hoursFocused.current = false; commitHours(); }}
                  onChange={e => setHoursText(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                  className={inputClass}
                />
              </div>
              <span className="text-2xl text-gray-400 font-bold pt-4 select-none">:</span>
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Minutes</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={minutesText}
                  onFocus={e => { minutesFocused.current = true; e.target.select(); }}
                  onBlur={() => { minutesFocused.current = false; commitMinutes(); }}
                  onChange={e => setMinutesText(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Scroll picker columns */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 flex overflow-hidden">
              <ScrollPicker
                label="Hours"
                values={HOUR_VALUES}
                value={hours}
                onChange={handleHoursChange}
              />
              <div className="w-px bg-gray-700 self-stretch" />
              <ScrollPicker
                label="Minutes"
                values={MINUTE_VALUES}
                value={minutes}
                onChange={handleMinutesChange}
              />
            </div>

            <p className="text-xs text-gray-500 mt-2">
              💡 There are <a href='https://runescape.wiki/w/Evil_Tree#Locations' target='_blank' rel='noopener noreferrer' className='text-blue-400 hover:text-blue-300 underline'>several ways</a> to learn when the next Evil Tree will spawn.
            </p>
          </div>

          {/* Optional tree info section */}
          <div className="border-t border-gray-700 pt-6">
            <h2 className="text-sm font-semibold text-gray-200 mb-4">
              Upcoming tree location <span className="text-gray-500 font-normal">(optional)</span>
            </h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Location hint</label>
                <select
                  value={hint}
                  onChange={e => setHint(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— none —</option>
                  {LOCATION_HINTS.map(lh => (
                    <option key={lh.hint} value={lh.hint}>
                      {lh.hint}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Hint revealing where the next Evil Tree will spawn.
                </p>
              </div>

            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={(hours * 60 + minutes) === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                text-white font-medium rounded py-2 transition-colors"
            >
              Set Timer
            </button>
            <button
              type="button"
              onClick={onBack}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
