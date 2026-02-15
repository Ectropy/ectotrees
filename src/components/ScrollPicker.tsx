import { useRef, useEffect, useCallback } from 'react';

interface ScrollPickerProps {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  label: string;
}

export function ScrollPicker({ values, value, onChange, label }: ScrollPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const scrollToValue = useCallback((v: number, smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-value="${v}"]`) as HTMLElement | null;
    if (btn) {
      el.scrollTo({ top: btn.offsetTop, behavior: smooth ? 'smooth' : 'instant' });
    }
  }, []);

  const selectValue = useCallback((v: number) => {
    onChange(v);
    scrollToValue(v, true);
  }, [onChange, scrollToValue]);

  // Instant scroll on mount
  useEffect(() => {
    scrollToValue(value, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth scroll when value changes (e.g. from text input)
  useEffect(() => {
    scrollToValue(value, true);
  }, [value, scrollToValue]);

  // Mouse wheel: one tick = one item
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? 1 : -1;
      const currentIdx = values.indexOf(valueRef.current);
      const nextIdx = Math.max(0, Math.min(values.length - 1, currentIdx + direction));
      if (nextIdx !== currentIdx) {
        selectValue(values[nextIdx]);
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [values, selectValue]);

  return (
    <div
      ref={scrollRef}
      className="relative flex-1 h-52 overflow-y-auto py-1"
      style={{ scrollbarWidth: 'none' }}
      role="listbox"
      aria-label={label}
    >
      {values.map(v => (
        <button
          key={v}
          data-value={v}
          type="button"
          role="option"
          aria-selected={v === value}
          tabIndex={-1}
          onClick={() => selectValue(v)}
          className={`flex items-center justify-center mx-auto w-12 h-10 rounded-full
                      text-sm transition-colors
            ${v === value
              ? 'bg-blue-600 text-white font-semibold'
              : 'text-gray-300 hover:bg-gray-600'
            }`}
        >
          {String(v).padStart(2, '0')}
        </button>
      ))}
      {/* Spacer so last items can scroll to top */}
      <div className="h-44" aria-hidden="true" />
    </div>
  );
}
