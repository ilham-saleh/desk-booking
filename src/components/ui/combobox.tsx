"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary line under the label (e.g. "Mon, Wed" for a shift, an email for a user). */
  description?: string;
  /** Small colour swatch shown before the label. */
  color?: string | null;
}

interface BaseProps {
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Called on every keystroke — pass this to drive a server-side search. */
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  /**
   * Extra rows rendered under a divider at the bottom of the list (e.g. "Manage
   * restrictions…"). Receives `close` so an action can dismiss the list before
   * opening another dialog.
   */
  footer?: React.ReactNode | ((close: () => void) => React.ReactNode);
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * Single-select searchable dropdown (Radix Popover + filtered list). Filtering
 * is client-side unless `onSearchChange` is supplied, in which case the caller
 * owns the option list.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  disabled,
  onSearchChange,
  loading,
  footer,
  className,
  id,
  ...aria
}: BaseProps & { value: string | null; onChange: (value: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const listId = React.useId();
  const selected = options.find((o) => o.value === value);
  const visible = onSearchChange ? options : filterOptions(options, query);

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          onSearchChange?.("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={aria["aria-label"]}
          disabled={disabled}
          className={cn(
            "border-input bg-surface hover:border-navy/30 focus-visible:border-cyan focus-visible:ring-cyan/20 data-[state=open]:border-cyan data-[state=open]:ring-[3px] data-[state=open]:ring-cyan/20 flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border px-3 py-2 text-left text-sm shadow-xs outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
            className,
          )}
        >
          <span className={cn("flex min-w-0 items-center gap-2 truncate", !selected && "text-muted-foreground")}>
            {selected?.color && <Swatch color={selected.color} />}
            <span className="truncate">{selected?.label ?? placeholder}</span>
          </span>
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" collisionPadding={12}>
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearchChange?.(e.target.value);
            }}
            className="h-8"
          />
        </div>
        <OptionList
          id={listId}
          options={visible}
          isSelected={(o) => o.value === value}
          onPick={(o) => {
            onChange(o.value);
            setOpen(false);
          }}
          emptyText={loading ? "Searching…" : emptyText}
        />
        {footer && (
          // Footer actions (e.g. "Create / manage restrictions") open another dialog, so the list closes once the action has run.
          <div className="border-t p-1" onClick={() => setOpen(false)}>
            {typeof footer === "function" ? footer(() => setOpen(false)) : footer}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Multi-select variant: selected values render as removable chips inside the trigger. */
export function MultiCombobox({
  values,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  disabled,
  onSearchChange,
  loading,
  footer,
  className,
  id,
  allowCustomValue,
  ...aria
}: BaseProps & {
  values: string[];
  onChange: (values: string[]) => void;
  /** When set, typing a value that matches this test and pressing Enter adds it verbatim (e.g. an email). */
  allowCustomValue?: (query: string) => boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const listId = React.useId();
  const byValue = new Map(options.map((o) => [o.value, o]));
  const visible = onSearchChange ? options : filterOptions(options, query);
  const trimmed = query.trim();
  const canAddCustom = !!allowCustomValue && trimmed.length > 0 && allowCustomValue(trimmed) && !values.includes(trimmed) && !byValue.has(trimmed);

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          onSearchChange?.("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={aria["aria-label"]}
          disabled={disabled}
          className={cn(
            "border-input bg-surface hover:border-navy/30 focus-visible:border-cyan focus-visible:ring-cyan/20 data-[state=open]:border-cyan data-[state=open]:ring-[3px] data-[state=open]:ring-cyan/20 flex min-h-10 w-full items-center justify-between gap-2 rounded-[10px] border px-2 py-1.5 text-left text-sm shadow-xs outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
            className,
          )}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {values.length === 0 && <span className="text-muted-foreground px-1">{placeholder}</span>}
            {values.slice(0, 4).map((value) => (
              <span key={value} className="bg-navy-soft text-navy inline-flex max-w-48 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <span className="truncate">{byValue.get(value)?.label ?? value}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Remove ${byValue.get(value)?.label ?? value}`}
                  className="hover:bg-foreground/10 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(value);
                  }}
                >
                  <XIcon className="size-3" />
                </span>
              </span>
            ))}
            {values.length > 4 && <span className="text-muted-foreground px-1 text-xs">+{values.length - 4} more</span>}
          </span>
          <ChevronDownIcon className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" collisionPadding={12}>
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearchChange?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAddCustom) {
                e.preventDefault();
                onChange([...values, trimmed]);
                setQuery("");
                onSearchChange?.("");
              }
            }}
            className="h-8"
          />
        </div>
        {canAddCustom && (
          <button
            type="button"
            className="hover:bg-navy-soft flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm transition-colors"
            onClick={() => {
              onChange([...values, trimmed]);
              setQuery("");
              onSearchChange?.("");
            }}
          >
            Add “{trimmed}”
          </button>
        )}
        <OptionList id={listId} options={visible} isSelected={(o) => values.includes(o.value)} onPick={(o) => toggle(o.value)} emptyText={loading ? "Searching…" : emptyText} />
        {values.length > 0 && (
          <div className="flex items-center justify-between border-t px-2 py-1">
            <span className="text-muted-foreground text-xs">{values.length} selected</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>
              Clear
            </Button>
          </div>
        )}
        {footer && (
          // Footer actions (e.g. "Create / manage restrictions") open another dialog, so the list closes once the action has run.
          <div className="border-t p-1" onClick={() => setOpen(false)}>
            {typeof footer === "function" ? footer(() => setOpen(false)) : footer}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function OptionList({
  id,
  options,
  isSelected,
  onPick,
  emptyText,
}: {
  id: string;
  options: ComboboxOption[];
  isSelected: (option: ComboboxOption) => boolean;
  onPick: (option: ComboboxOption) => void;
  emptyText: string;
}) {
  return (
    <ul id={id} role="listbox" className="max-h-[min(16rem,calc(var(--radix-popover-content-available-height)-6rem))] overflow-y-auto overscroll-contain p-1.5 scroll-quiet">
      {options.length === 0 && <li className="text-muted-foreground px-3 py-4 text-center text-sm">{emptyText}</li>}
      {options.map((option) => {
        const selected = isSelected(option);
        return (
          <li key={option.value} role="option" aria-selected={selected}>
            <button
              type="button"
              onClick={() => onPick(option)}
              className={cn(
                "hover:bg-navy-soft focus-visible:bg-navy-soft flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors duration-100",
                selected && "text-navy font-medium",
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center pt-0.5">{selected && <CheckIcon className="text-cyan size-4" strokeWidth={2.5} />}</span>
              {option.color && <Swatch color={option.color} className="mt-1" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {option.description && <span className="text-muted-foreground block truncate text-xs">{option.description}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ backgroundColor: color }} />;
}

function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.label.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q));
}
