"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

import { formatDisplayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Trigger look shared by the calendar popovers — matches SelectTrigger. */
export const pickerTriggerClassName = cn(
  "border-input bg-surface text-foreground flex h-10 items-center gap-2 rounded-[10px] border px-3 text-sm whitespace-nowrap shadow-xs outline-none",
  "hover:border-navy/30 focus-visible:border-cyan focus-visible:ring-cyan/20 transition-[border-color,box-shadow,background-color] duration-150 focus-visible:ring-[3px]",
  "data-[state=open]:border-cyan data-[state=open]:ring-cyan/20 data-[state=open]:ring-[3px] disabled:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60",
);

/** Date field that opens the app's calendar instead of the browser's native picker. Picking a day applies it. */
export function DatePicker({
  id,
  value,
  onChange,
  today,
  isSelectable,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  /** YYYY-MM-DD. */
  value: string;
  onChange: (value: string) => void;
  /** Today's date in the relevant (site) time zone. */
  today: string;
  isSelectable: (iso: string) => boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  // The year only appears when it isn't the current one, so the label fits narrow panels.
  const label = valid
    ? `${value === today ? "Today, " : ""}${formatDisplayDate(value, { year: value.slice(0, 4) !== today.slice(0, 4) })}`
    : "Select a date";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel}: ${label}` : undefined}
          className={cn(pickerTriggerClassName, "w-full", className)}
        >
          <CalendarDays className="text-muted-foreground size-4 shrink-0" />
          <span className={cn("min-w-0 flex-1 truncate text-left tabular-nums", !valid && "text-muted-foreground")}>{label}</span>
          <ChevronDown className="size-4 shrink-0 opacity-70 transition-transform duration-150 [[data-state=open]>&]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[20rem] p-0">
        <Calendar
          selected={valid ? value : ""}
          today={today}
          isSelectable={isSelectable}
          onSelect={(day) => {
            onChange(day);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
