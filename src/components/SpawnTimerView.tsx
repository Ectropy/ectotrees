import { useState, useRef, useCallback, useEffect } from 'react';
import { Timer, Lightbulb } from 'lucide-react';
import { LOCATION_HINTS } from '../constants/evilTree';
import { SPAWN_COLOR, TEXT_COLOR } from '../constants/toolColors';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { ViewHeader } from './ViewHeader';
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from '@ncdai/react-wheel-picker';
import type { WorldConfig, SpawnTreeInfo } from '../types';
import { SelectCombobox } from './ui/select-combobox';

const HOUR_VALUES = Array.from({ length: 2 }, (_, i) => i);      // [0..1]
const MINUTE_VALUES = Array.from({ length: 59 }, (_, i) => i + 1); // [1..59]

const hourOptions: WheelPickerOption<number>[] = HOUR_VALUES.map(v => ({
  value: v,
  label: String(v),
}));

const minuteOptions: WheelPickerOption<number>[] = MINUTE_VALUES.map(v => ({
  value: v,
  label: String(v),
}));

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

  const [hoursText, setHoursText] = useState('0');
  const [minutesText, setMinutesText] = useState('30');
  const hoursFocused = useRef(false);
  const minutesFocused = useRef(false);
  const minutesInputRef = useRef<HTMLInputElement>(null);
  const hintInputRef = useRef<HTMLInputElement>(null);
  const hoursCommitted = useRef(false);

  // Grab cursor state for wheel picker
  const [grabbing, setGrabbing] = useState(false);
  const handlePointerDown = useCallback(() => setGrabbing(true), []);
  useEffect(() => {
    if (!grabbing) return;
    const stop = () => setGrabbing(false);
    document.addEventListener('mouseup', stop);
    document.addEventListener('pointerup', stop);
    return () => {
      document.removeEventListener('mouseup', stop);
      document.removeEventListener('pointerup', stop);
    };
  }, [grabbing]);

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

  useEscapeKey(onBack);

  function doSubmit(finalMinutes: number) {
    const totalMs = ((hours * 60) + finalMinutes) * 60 * 1000;
    if (totalMs <= 0) return;
    const match = hint ? LOCATION_HINTS.find(lh => lh.hint === hint) : undefined;
    const treeInfo: SpawnTreeInfo | undefined = hint
      ? { treeHint: hint, treeExactLocation: match?.locations.length === 1 ? match.locations[0] : undefined }
      : undefined;
    onSubmit(totalMs, treeInfo);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSubmit(minutes);
  }

  const inputClass = 'bg-gray-600 text-white text-center text-lg font-semibold rounded px-2 py-1.5 border border-gray-500 focus:border-blue-400 focus:outline-none w-full';

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <ViewHeader icon={<Timer className="h-5 w-5" />} title="Set Spawn Timer" world={world} />
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
            <label className={`block text-sm font-semibold ${TEXT_COLOR.prominent}`}>Time until spawn</label>

            {/* Text entry row */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className={`text-xs ${TEXT_COLOR.muted} block mb-1`}>Hours</label>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={hoursText}
                  onFocus={e => { hoursFocused.current = true; e.target.select(); }}
                  onBlur={() => { hoursFocused.current = false; if (!hoursCommitted.current) commitHours(); hoursCommitted.current = false; }}
                  onChange={e => {
                    const digit = e.target.value.replace(/\D/g, '').slice(0, 1);
                    setHoursText(digit);
                    if (digit.length === 1) {
                      const clamped = clampToValues(parseInt(digit, 10), HOUR_VALUES);
                      setHours(clamped);
                      setHoursText(String(clamped));
                      hoursCommitted.current = true;
                      minutesInputRef.current?.focus();
                    }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                  className={inputClass}
                />
              </div>
              <span className={`text-2xl ${TEXT_COLOR.muted} font-bold pt-4 select-none`}>:</span>
              <div className="flex-1">
                <label className={`text-xs ${TEXT_COLOR.muted} block mb-1`}>Minutes</label>
                <input
                  ref={minutesInputRef}
                  type="text"
                  inputMode="numeric"
                  value={minutesText}
                  onFocus={e => { minutesFocused.current = true; e.target.select(); }}
                  onBlur={() => { minutesFocused.current = false; commitMinutes(); }}
                  onChange={e => setMinutesText(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const typed = parseInt(minutesText, 10);
                      const finalMinutes = isNaN(typed) || minutesText.trim() === '' ? minutes : clampToValues(typed, MINUTE_VALUES);
                      doSubmit(finalMinutes);
                    }
                    if (e.key === 'Tab' && !e.shiftKey) {
                      e.preventDefault();
                      hintInputRef.current?.focus();
                    }
                  }}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Wheel picker columns */}
            <div
              className={grabbing ? 'wheel-grabbing' : 'wheel-grab'}
              onPointerDown={handlePointerDown}
            >
            <WheelPickerWrapper className="rounded-lg border border-gray-700 bg-gray-800">
              <WheelPicker
                options={hourOptions}
                value={hours}
                scrollSensitivity={10}
                visibleCount={12}
                onValueChange={handleHoursChange}
                classNames={{
                  optionItem: 'text-gray-500',
                  highlightWrapper: SPAWN_COLOR.subtle,
                  highlightItem: 'text-white font-semibold',
                }}
              />
              <WheelPicker
                options={minuteOptions}
                value={minutes}
                scrollSensitivity={10}
                visibleCount={12}
                onValueChange={handleMinutesChange}
                classNames={{
                  optionItem: 'text-gray-500',
                  highlightWrapper: SPAWN_COLOR.subtle,
                  highlightItem: 'text-white font-semibold',
                }}
              />
            </WheelPickerWrapper>
            </div>

            <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
              <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-px" /> <span>There are <a href='https://runescape.wiki/w/Evil_Tree#Locations' target='_blank' rel='noopener noreferrer' className='text-blue-400 hover:text-blue-300 underline'>several ways</a> to learn when the next Evil Tree will spawn.</span>
            </p>
          </div>

          {/* Optional tree info section */}
          <div className="border-t border-gray-700 pt-6">
            <h2 className={`text-sm font-semibold ${TEXT_COLOR.prominent} mb-4`}>
              Upcoming tree location <span className="text-gray-500 font-normal">(optional)</span>
            </h2>

            <div className="space-y-3">
              <div>
                <label className={`text-xs ${TEXT_COLOR.muted} block mb-1`}>Location hint</label>
                <SelectCombobox
                  items={LOCATION_HINTS.map(lh => lh.hint)}
                  value={hint || null}
                  onValueChange={v => setHint(v ?? '')}
                  inputRef={hintInputRef}
                  clearLabel="— none —"
                  autoHighlight
                  placeholder="Select or type a location hint"
                />
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
              className={`flex-1 ${SPAWN_COLOR.bg} ${SPAWN_COLOR.bgHover} disabled:opacity-40 disabled:cursor-not-allowed
                text-white font-medium rounded py-2 transition-colors`}
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
