import type { ReactNode } from 'react';
import { Cloud, CloudOff, CloudUpload, CloudCheck } from 'lucide-react';
import { Tooltip } from './ui/tooltip';

interface SubmitBarProps {
  canSubmit: boolean;
  autoSubmit: boolean;
  autoCountdown: number | null;
  cloudCheck: boolean;
  blinkFrame: boolean;
  onSubmit: () => void;
  onAutoSubmitToggle: () => void;
  onClear: () => void;
  submitLabel: string;
  /** Optional leading icon inside the submit button (DeadForm's Skull). */
  submitIcon?: ReactNode;
  /** Tooltip shown once the submission is acknowledged. */
  submittedTooltip: string;
  /** Tooltip explaining what enables auto-submit for this form. */
  autoSubmitHint: string;
  /* Per-form color tokens. The alpha-variant classes must be the pre-computed
     -aNN utilities from index.css, passed verbatim — never slash variants,
     which compile to color-mix() and silently fail in Alt1's pre-oklch CEF. */
  borderClass: string;
  labelClass: string;
  textClass: string;
  hoverBgClass: string;
  dividerBgClass: string;
  activeBgClass: string;
}

/** Split submit + auto-submit cloud button, plus the Clear button. */
export function SubmitBar({
  canSubmit, autoSubmit, autoCountdown, cloudCheck, blinkFrame,
  onSubmit, onAutoSubmitToggle, onClear,
  submitLabel, submitIcon, submittedTooltip, autoSubmitHint,
  borderClass, labelClass, textClass, hoverBgClass, dividerBgClass, activeBgClass,
}: SubmitBarProps) {
  return (
    <div className="flex gap-2">
      <div className={`flex flex-1 rounded overflow-hidden ${borderClass}`}>
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`flex-1 ${submitIcon ? 'flex items-center justify-center gap-1.5 ' : ''}bg-transparent ${labelClass} py-2 text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${hoverBgClass} transition-colors`}
        >
          {submitIcon}
          {autoCountdown !== null ? `${submitLabel} (${autoCountdown}s)` : submitLabel}
        </button>
        <div className={`w-px ${dividerBgClass} self-stretch`} />
        <Tooltip
          content={
            cloudCheck
              ? submittedTooltip
              : autoCountdown !== null
              ? `Submitting in ${autoCountdown}s — click to cancel`
              : autoSubmit
              ? 'Click to disable auto-submit.'
              : autoSubmitHint
          }
          side="top"
        >
          <button
            onClick={onAutoSubmitToggle}
            aria-label="Toggle auto-submit"
            className={`flex items-center justify-center px-2.5 ${textClass} hover:opacity-90 transition-all ${autoSubmit || cloudCheck ? activeBgClass : 'opacity-40'}`}
          >
            {cloudCheck ? (
              <CloudCheck size={14} />
            ) : autoCountdown !== null ? (
              blinkFrame ? <CloudUpload size={14} /> : <Cloud size={14} />
            ) : autoSubmit ? (
              <Cloud size={14} />
            ) : (
              <CloudOff size={14} />
            )}
          </button>
        </Tooltip>
      </div>
      <button
        onClick={onClear}
        className="bg-transparent text-muted-foreground text-xs font-semibold px-2.5 py-1 rounded border border-border hover:bg-secondary hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
}
