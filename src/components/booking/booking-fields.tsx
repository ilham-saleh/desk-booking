"use client";

import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { shiftIsoDate } from "@/lib/dates";
import { formatMinutesLabel, isWeekday } from "@/lib/time-slots";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Bookable days: weekdays (bookings are weekday-only) on or after `min`. */
function isBookableDate(iso: string, min: string | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && isWeekday(iso) && (!min || iso >= min);
}

/** The nearest bookable day before/after `from`, within two weeks. */
function stepBookableDate(from: string, direction: -1 | 1, min: string | undefined): string | null {
  for (let step = 1; step <= 14; step += 1) {
    const day = shiftIsoDate(from, direction * step);
    if (isBookableDate(day, min)) return day;
  }
  return null;
}

/**
 * Date field (the app's calendar popover) with previous/next steppers. Steppers
 * and calendar both skip weekends and days before `min` — the site-local today.
 */
export function DateStepper({
  id,
  value,
  onChange,
  min,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const previous = valid ? stepBookableDate(value, -1, min) : null;
  const next = valid ? stepBookableDate(value, 1, min) : null;
  const stepClass =
    "text-muted-foreground hover:bg-navy-soft hover:text-navy focus-visible:ring-cyan/40 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-35";
  return (
    // min-w-0: the picker's label doesn't wrap, so without it this row would set the form's minimum width.
    <div className={cn("flex min-w-0 items-center gap-0.5", className)}>
      <button type="button" className={stepClass} aria-label="Previous day" disabled={!previous} onClick={() => previous && onChange(previous)}>
        <ChevronLeft className="size-4" />
      </button>
      <DatePicker
        id={id}
        value={value}
        onChange={onChange}
        // Before a site is chosen there's no site-local today yet; the browser's date is a placeholder.
        today={min ?? new Date().toLocaleDateString("en-CA")}
        isSelectable={(day) => isBookableDate(day, min)}
        aria-label={ariaLabel ?? "Date"}
        className="min-w-0 flex-1"
      />
      <button type="button" className={stepClass} aria-label="Next day" disabled={!next} onClick={() => next && onChange(next)}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** Start/end time selects over the site's bookable slots. */
export function TimeRangeFields({
  idPrefix,
  startOptions,
  endOptions,
  start,
  end,
  onStartChange,
  onEndChange,
  disabled,
  showLabels = true,
  compact = false,
  className,
}: {
  idPrefix: string;
  startOptions: number[];
  endOptions: number[];
  start: number | null;
  end: number | null;
  onStartChange: (minutes: number) => void;
  onEndChange: (minutes: number) => void;
  disabled?: boolean;
  showLabels?: boolean;
  /** Toolbar variant: one leading clock icon instead of one per field. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end", "gap-2", className)}>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-start`} className={cn(!showLabels && "sr-only")}>
          Start
        </Label>
        <Select value={start !== null ? String(start) : ""} onValueChange={(v) => onStartChange(Number(v))} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-start`} className="w-full tabular-nums">
            <span className="flex min-w-0 items-center gap-2">
              <Clock className="text-muted-foreground size-3.5" />
              <SelectValue placeholder="Start" />
            </span>
          </SelectTrigger>
          <SelectContent>
            {startOptions.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)} className="tabular-nums">
                {formatMinutesLabel(minutes)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span aria-hidden className="text-muted-foreground pb-2.5 text-sm">
        –
      </span>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-end`} className={cn(!showLabels && "sr-only")}>
          End
        </Label>
        <Select value={end !== null ? String(end) : ""} onValueChange={(v) => onEndChange(Number(v))} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-end`} className="w-full tabular-nums">
            <span className="flex min-w-0 items-center gap-2">
              {!compact && <Clock className="text-muted-foreground size-3.5" />}
              <SelectValue placeholder="End" />
            </span>
          </SelectTrigger>
          <SelectContent>
            {endOptions.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)} className="tabular-nums">
                {formatMinutesLabel(minutes)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
