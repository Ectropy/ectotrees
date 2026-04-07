import { createContext, useContext } from 'react';
import { cn } from '../../lib/utils';

const HoverContext = createContext('');

interface SplitButtonProps {
  borderClass: string;
  divideClass: string;
  hoverClass: string;
  className?: string;
  children: React.ReactNode;
}

export function SplitButton({ borderClass, divideClass, hoverClass, className, children }: SplitButtonProps) {
  return (
    <HoverContext.Provider value={hoverClass}>
      <div className={cn('flex items-stretch border rounded overflow-hidden divide-x flex-shrink-0', borderClass, divideClass, className)}>
        {children}
      </div>
    </HoverContext.Provider>
  );
}

interface SplitButtonSegmentProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function SplitButtonSegment({ className, children, ...props }: SplitButtonSegmentProps) {
  const hoverClass = useContext(HoverContext);
  return (
    <button
      className={cn('flex items-center px-2 py-0.5 transition-colors', hoverClass, className)}
      {...props}
    >
      {children}
    </button>
  );
}
