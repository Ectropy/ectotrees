import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export { useDefaultLayout };

export function ResizablePanelGroup({ className, ...props }: ComponentProps<typeof Group>) {
  return (
    <Group
      className={cn('w-full', className)}
      {...props}
    />
  );
}

export { Panel as ResizablePanel };

export function ResizableHandle({ withHandle = true, className, ...props }: ComponentProps<typeof Separator> & { withHandle?: boolean }) {
  return (
    <Separator
      className={cn(
        'relative flex w-1 shrink-0 items-center justify-center bg-gray-700',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2',
        'hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-1',
        'focus-visible:ring-blue-500 focus-visible:ring-offset-1',
        'transition-colors duration-150 cursor-col-resize',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-3 items-center justify-center rounded-sm border border-gray-600 bg-gray-800">
          {/* Three-dot grip — mirrors shadcn/ui's GripVertical icon */}
          <div className="flex flex-col gap-0.5">
            <span className="block h-0.5 w-1.5 rounded-full bg-gray-500" />
            <span className="block h-0.5 w-1.5 rounded-full bg-gray-500" />
            <span className="block h-0.5 w-1.5 rounded-full bg-gray-500" />
          </div>
        </div>
      )}
    </Separator>
  );
}
