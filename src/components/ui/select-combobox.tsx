import * as React from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import {
  Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem,
  ComboboxGroup, ComboboxGroupLabel, ComboboxCollection, ComboboxEmpty,
} from './combobox';

export type GroupedItems = { label: string; items: string[] };

export interface SelectComboboxProps {
  items: string[] | GroupedItems[];
  value: string | null;
  onValueChange: (v: string | null) => void;
  placeholder?: string;
  itemToStringLabel?: (item: string) => string;
  /** Desktop only — skipped on mobile to avoid immediately popping the iOS picker */
  autoFocus?: boolean;
  /** Desktop only — for programmatic Tab-focus (e.g. SpawnTimerView) */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** When set, adds a selectable "none" option (mobile) / shows clear option (desktop) */
  clearLabel?: string;
  autoHighlight?: boolean;
  className?: string;
}

function isGrouped(items: string[] | GroupedItems[]): items is GroupedItems[] {
  return items.length > 0 && typeof items[0] === 'object' && 'items' in items[0];
}

const selectClass =
  'w-full bg-gray-600 text-white text-sm rounded px-2 py-1.5 border border-gray-500 focus:outline-none focus:border-blue-400';

export function SelectCombobox({
  items,
  value,
  onValueChange,
  placeholder,
  itemToStringLabel,
  autoFocus,
  inputRef,
  clearLabel,
  autoHighlight,
  className,
}: SelectComboboxProps) {
  const isMobile = useIsMobile();
  const label = (item: string) => itemToStringLabel?.(item) ?? item;

  // ── Mobile: native <select> ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <select
        value={value ?? ''}
        onChange={e => onValueChange(e.target.value || null)}
        className={cn(selectClass, className)}
      >
        <option value="">{clearLabel ?? placeholder?.replace(' or type', '')}</option>
        {isGrouped(items)
          ? items.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map(item => (
                  <option key={item} value={item}>{label(item)}</option>
                ))}
              </optgroup>
            ))
          : items.map(item => (
              <option key={item} value={item}>{label(item)}</option>
            ))
        }
      </select>
    );
  }

  // ── Desktop: grouped combobox ───────────────────────────────────────────────
  if (isGrouped(items)) {
    return (
      <Combobox
        items={items}
        itemToStringLabel={itemToStringLabel}
        value={value}
        onValueChange={v => onValueChange(v as string | null)}
        autoHighlight={autoHighlight}
      >
        <ComboboxInput ref={inputRef} autoFocus={autoFocus} placeholder={placeholder} className={className} />
        <ComboboxContent>
          <ComboboxEmpty>No matching option.</ComboboxEmpty>
          <ComboboxList>
            {(group: GroupedItems) => (
              <ComboboxGroup key={group.label} items={group.items}>
                <ComboboxGroupLabel>{group.label}</ComboboxGroupLabel>
                <ComboboxCollection>
                  {(item: string) => (
                    <ComboboxItem key={item} value={item}>{label(item)}</ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    );
  }

  // ── Desktop: flat combobox ──────────────────────────────────────────────────
  return (
    <Combobox
      items={items}
      itemToStringLabel={itemToStringLabel}
      value={value}
      onValueChange={v => onValueChange(v as string | null)}
      autoHighlight={autoHighlight}
    >
      <ComboboxInput ref={inputRef} autoFocus={autoFocus} placeholder={placeholder} className={className} />
      <ComboboxContent>
        <ComboboxEmpty>No matching option.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>{label(item)}</ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
