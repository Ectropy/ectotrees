import * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const Combobox = ComboboxPrimitive.Root;

const ComboboxInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithRef<typeof ComboboxPrimitive.Input>
>(({ className, ...props }, ref) => {
  return (
    <div className="relative flex w-full">
      <ComboboxPrimitive.Input
        ref={ref}
        className={cn(
          'w-full bg-gray-600 text-white text-sm rounded px-2 py-1.5 pr-7 border border-gray-500',
          'focus:outline-none focus:border-blue-400 placeholder:text-gray-400 truncate',
          className
        )}
        {...props}
      />
      <ComboboxPrimitive.Trigger className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 focus:outline-none">
        <ChevronDown className="h-4 w-4" />
      </ComboboxPrimitive.Trigger>
    </div>
  );
});
ComboboxInput.displayName = 'ComboboxInput';

function ComboboxContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Positioner> & {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="z-50"
        {...props}
      >
        <ComboboxPrimitive.Popup
          className={cn(
            'w-[var(--anchor-width)] min-w-48 bg-gray-700 border border-gray-600 rounded-lg shadow-xl overflow-hidden',
            'data-[open]:animate-in data-[closed]:animate-out',
            'data-[open]:fade-in-0 data-[closed]:fade-out-0',
            'data-[open]:zoom-in-95 data-[closed]:zoom-out-95',
            'duration-100 origin-top',
            className
          )}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.List>) {
  return (
    <ComboboxPrimitive.List
      className={cn('max-h-72 overflow-y-auto overscroll-contain p-1', className)}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Item>) {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        'relative flex items-center gap-2 px-2 py-1.5 pr-8 text-sm text-white rounded cursor-default select-none',
        'data-[highlighted]:bg-gray-600 data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex items-center justify-center">
        <Check className="h-3.5 w-3.5 text-blue-400" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Group>) {
  return <ComboboxPrimitive.Group className={cn(className)} {...props} />;
}

function ComboboxGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.GroupLabel>) {
  return (
    <ComboboxPrimitive.GroupLabel
      className={cn('text-xs text-gray-400 font-semibold px-2 pt-2 pb-0.5 select-none', className)}
      {...props}
    />
  );
}

function ComboboxCollection(props: React.ComponentProps<typeof ComboboxPrimitive.Collection>) {
  return <ComboboxPrimitive.Collection {...props} />;
}

function ComboboxEmpty({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Empty>) {
  return (
    <ComboboxPrimitive.Empty
      className={cn('text-sm text-gray-400 text-center py-3 px-2 empty:hidden', className)}
      {...props}
    />
  );
}

function ComboboxSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Separator>) {
  return (
    <ComboboxPrimitive.Separator
      className={cn('border-t border-gray-600 mx-1 my-1', className)}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
};
