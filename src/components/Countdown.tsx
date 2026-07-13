import { memo } from 'react';
import { useSharedNow } from '@shared-browser/clock';
import { formatMs } from '../constants/evilTree';

interface Props {
  /** ms timestamp the countdown runs toward; clamped at 0 once reached */
  target: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Leaf countdown display driven by the shared clock. Keeping the clock
 * subscription in this leaf means a tick re-renders only the countdown text,
 * not the card that contains it.
 */
export const Countdown = memo(function Countdown({ target, prefix = '', suffix = '', className }: Props) {
  const now = useSharedNow();
  const remaining = Math.max(0, target - now);
  return <div className={className}>{`${prefix}${formatMs(remaining)}${suffix}`}</div>;
});
