import { useEffect, useRef, useState } from 'react';
import tipsData from '../data/tips.json';

// Pixels per second — controls scroll speed
const SPEED_PX_PER_S = 20;
const SEPARATOR = '\u00A0\u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0\u00A0';

export function TipTicker() {
  // Shuffle once on mount so tips appear in a random order each page load
  const [text] = useState(() => {
    const shuffled = [...tipsData.tips];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Trailing separator keeps the loop seam consistent with mid-list separators
    return shuffled.join(SEPARATOR) + SEPARATOR;
  });

  const copyRef = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (copyRef.current) {
      setDuration(copyRef.current.offsetWidth / SPEED_PX_PER_S);
    }
  }, []);

  return (
    <div className="overflow-hidden flex-1 min-w-0 flex items-center">
      {/*
        Two identical copies side-by-side. The animation moves the pair from
        translateX(0) → translateX(-50%), at which point copy 2 is in copy 1's
        original position, making the loop perfectly seamless.
      */}
      <div
        className="inline-flex animate-ticker leading-none"
        style={duration != null
          ? { animationDuration: `${duration}s` }
          : { visibility: 'hidden' }}
      >
        <span ref={copyRef} className="inline-block whitespace-nowrap text-[10px] text-gray-500 leading-none">
          {text}
        </span>
        <span aria-hidden="true" className="inline-block whitespace-nowrap text-[10px] text-gray-500 leading-none">
          {text}
        </span>
      </div>
    </div>
  );
}
