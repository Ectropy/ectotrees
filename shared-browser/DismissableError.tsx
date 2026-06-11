import { X } from 'lucide-react';

interface DismissableErrorProps {
  message: string;
  onDismiss: () => void;
  /** Color/typography/layout classes from the host app (e.g. "text-red-500 text-xs hover:text-red-400") */
  className?: string;
}

/**
 * Inline error message that dismisses on click. The X icon and hover
 * underline make the dismiss affordance visible; colors and sizing are
 * provided by the host app via className.
 */
export function DismissableError({ message, onDismiss, className = '' }: DismissableErrorProps) {
  return (
    <button
      onClick={onDismiss}
      title="Click to dismiss"
      className={`group flex items-start gap-1 text-left transition-colors ${className}`}
    >
      <X className="w-3 h-3 shrink-0 mt-px" aria-hidden="true" />
      <span className="group-hover:underline">{message}</span>
    </button>
  );
}
