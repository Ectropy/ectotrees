import { useEffect, useRef, useState } from 'react';
import { Timer, TreeDeciduous, Skull } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import tipsData from '../data/tips.json';
import { TEXT_COLOR } from '../constants/toolColors';

// Pixels per second — controls scroll speed
const SPEED_PX_PER_S = 20;
const SEPARATOR = '\u00A0\u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0\u00A0';

const ICON_MAP: Record<string, LucideIcon> = {
  Timer,
  TreeDeciduous,
  Skull,
};

type Segment = { type: 'text'; value: string } | { type: 'icon'; name: string };

function parseTip(tip: string): Segment[] {
  const parts = tip.split(/\{(\w+)\}/);
  return parts.map((part, i) =>
    i % 2 === 0
      ? { type: 'text', value: part }
      : { type: 'icon', name: part }
  );
}

function TipSegments({ tip }: { tip: string }) {
  return (
    <>
      {parseTip(tip).map((seg, i) => {
        if (seg.type === 'text') return <span key={i}>{seg.value}</span>;
        const Icon = ICON_MAP[seg.name];
        return Icon
          ? <Icon key={i} size={10} className="inline-block align-middle mx-0.5 shrink-0" />
          : <span key={i}>{`{${seg.name}}`}</span>;
      })}
    </>
  );
}

export function TipTicker() {
  // Shuffle once on mount so tips appear in a random order each page load
  const [tips] = useState(() => {
    const shuffled = [...tipsData.tips];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  });

  const copyRef = useRef<HTMLSpanElement>(null);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (copyRef.current) {
      setDuration(copyRef.current.offsetWidth / SPEED_PX_PER_S);
    }
  }, []);

  const tipNodes = tips.map((tip, i) => (
    <span key={i}>
      <TipSegments tip={tip} />
      {i < tips.length - 1 ? SEPARATOR : ''}
    </span>
  ));
  // Trailing separator keeps the loop seam consistent with mid-list separators
  const content = <>{tipNodes}<span>{SEPARATOR}</span></>;

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
        <span ref={copyRef} className={`inline-flex items-center whitespace-nowrap text-[10px] ${TEXT_COLOR.prominent} leading-none`}>
          {content}
        </span>
        <span aria-hidden="true" className={`inline-flex items-center whitespace-nowrap text-[10px] ${TEXT_COLOR.prominent} leading-none`}>
          {content}
        </span>
      </div>
    </div>
  );
}
