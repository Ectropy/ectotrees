import * as React from 'react';
import { Combobox } from '@base-ui/react';
import { ChevronDown, Check } from 'lucide-react';

export type GroupedItems = { label: string; items: string[] };

interface SelectComboboxProps {
  items: string[] | GroupedItems[];
  value: string | null;
  onValueChange: (v: string | null) => void;
  placeholder?: string;
  itemToStringLabel?: (item: string) => string;
  className?: string;
}

function isGrouped(items: string[] | GroupedItems[]): items is GroupedItems[] {
  return items.length > 0 && typeof items[0] === 'object' && 'items' in items[0];
}

const inputClass =
  'w-full bg-input text-foreground text-xs rounded px-2 py-1 pr-7 border border-border focus:outline-none focus:border-primary placeholder:text-muted-foreground truncate';
const popupClass =
  'w-[var(--anchor-width)] min-w-48 bg-secondary border border-border rounded shadow-xl overflow-hidden z-50';
const listClass = 'max-h-60 overflow-y-auto overscroll-contain p-1';
const itemClass =
  'relative flex items-center gap-2 px-2 py-1 pr-7 text-xs text-foreground rounded cursor-default select-none data-[highlighted]:bg-accent';
const groupLabelClass =
  'text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2 pt-1.5 pb-0.5 select-none';

export function SelectCombobox({
  items,
  value,
  onValueChange,
  placeholder,
  itemToStringLabel,
  className,
}: SelectComboboxProps) {
  const label = (item: string) => itemToStringLabel?.(item) ?? item;

  return (
    <Combobox.Root
      items={items}
      itemToStringLabel={itemToStringLabel}
      value={value}
      onValueChange={(v: unknown) => onValueChange((v as string | null) ?? null)}
      autoHighlight
    >
      <div className={`relative flex w-full ${className ?? ''}`}>
        <Combobox.Input placeholder={placeholder} className={inputClass} />
        <Combobox.Trigger
          aria-label="Open"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
        >
          <ChevronDown size={14} />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="z-50">
          <Combobox.Popup className={popupClass}>
            <Combobox.Empty className="text-xs text-muted-foreground text-center py-2 px-2 empty:hidden">
              No matching option.
            </Combobox.Empty>
            <Combobox.List className={listClass}>
              {isGrouped(items)
                ? (group: GroupedItems) => (
                    <Combobox.Group key={group.label} items={group.items}>
                      <Combobox.GroupLabel className={groupLabelClass}>
                        {group.label}
                      </Combobox.GroupLabel>
                      <Combobox.Collection>
                        {(item: string) => (
                          <Combobox.Item key={item} value={item} className={itemClass}>
                            {label(item)}
                            <Combobox.ItemIndicator className="absolute right-1.5 flex items-center justify-center">
                              <Check size={12} className="text-primary" />
                            </Combobox.ItemIndicator>
                          </Combobox.Item>
                        )}
                      </Combobox.Collection>
                    </Combobox.Group>
                  )
                : (item: string) => (
                    <Combobox.Item key={item} value={item} className={itemClass}>
                      {label(item)}
                      <Combobox.ItemIndicator className="absolute right-1.5 flex items-center justify-center">
                        <Check size={12} className="text-primary" />
                      </Combobox.ItemIndicator>
                    </Combobox.Item>
                  )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
