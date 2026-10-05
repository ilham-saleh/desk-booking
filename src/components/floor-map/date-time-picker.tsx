"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

import { formatDisplayDate } from "@/lib/dates";
import { formatMinutesLabel, isMapDateSelectable, mapStartOptions, todayInTimeZone } from "@/lib/time-slots";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { pickerTriggerClassName } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PickerSite = { timeZone: string; operatingHoursStart: number; operatingHoursEnd: number };
/** A concrete start time, or "now" — the current slot, which keeps moving with the clock. */
type StartChoice = number | "now";

const NOW_VALUE = "now";

/** Keeps a start choice valid for a newly picked date: "Now" only exists today, and past/unknown times fall back. */
function reconcileStart(date: string, start: StartChoice, site: PickerSite, now: Date): StartChoice {
  const { nowSlot, options } = mapStartOptions(date, site, now);
  if (start === "now") return nowSlot !== null ? "now" : (options[0] ?? "now");
  if (options.includes(start)) return start;
  return nowSlot !== null ? "now" : (options[0] ?? "now");
}

/**
 * Floor Map "when" control: one trigger opening a calendar with the start
 * time inside it. Choices are staged and only applied on OK. Past dates,
 * weekends and past start times are never offered — all decided in the site's
 * time zone, not the browser's.
 */
export function MapDateTimePicker({
  site,
  date,
  startMinutes,
  isNow,
  now,
  onApply,
  disabled,
  className,
}: {
  site: PickerSite | null;
  date: string | null;
  /** The effective start shown on the map. */
  startMinutes: number | null;
  /** Whether the map is following the clock ("Now") rather than a fixed time. */
  isNow: boolean;
  now: Date;
  /** `startMinutes` null means "Now" on today, opening time on other dates. */
  onApply: (date: string, startMinutes: number | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftStart, setDraftStart] = useState<StartChoice>("now");

  if (!site || !date || startMinutes === null) {
    return (
      <Button variant="outline" disabled className={cn("justify-start gap-2 font-normal", className)}>
        <CalendarDays className="text-muted-foreground size-4" />
        <span className="text-muted-foreground">Loading…</span>
      </Button>
    );
  }

  const today = todayInTimeZone(site.timeZone, now);
  const triggerDate = date === today ? "Today" : formatDisplayDate(date);
  const triggerTime = isNow ? "Now" : formatMinutesLabel(startMinutes);
  const { nowSlot, options } = mapStartOptions(draftDate, site, now);

  function openPicker(next: boolean) {
    // Seed the draft from what the map shows; it's only applied on OK.
    if (next && date && site) {
      setDraftDate(date);
      setDraftStart(reconcileStart(date, isNow ? "now" : (startMinutes ?? "now"), site, now));
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={openPicker}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Date and time: ${triggerDate}, ${triggerTime}`}
          className={cn(pickerTriggerClassName, className)}
        >
          <CalendarDays className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">
            {triggerDate} <span className="text-muted-foreground">·</span> {triggerTime}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-70 transition-transform duration-150 [[data-state=open]>&]:rotate-180" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[20rem] p-0">
        <Calendar
          selected={draftDate}
          today={today}
          isSelectable={(day) => isMapDateSelectable(day, site, now)}
          onSelect={(day) => {
            setDraftDate(day);
            setDraftStart((current) => reconcileStart(day, current, site, now));
          }}
        />

        {/* Start time — only times that haven't passed */}
        <div className="flex items-center gap-3 border-t px-4 py-3">
          <Label htmlFor="floor-map-time" className="text-text-secondary text-sm font-medium">
            Time:
          </Label>
          <Select value={draftStart === "now" ? NOW_VALUE : String(draftStart)} onValueChange={(value) => setDraftStart(value === NOW_VALUE ? "now" : Number(value))}>
            <SelectTrigger id="floor-map-time" className="w-36 tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nowSlot !== null && <SelectItem value={NOW_VALUE}>Now</SelectItem>}
              {options.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)} className="tabular-nums">
                  {formatMinutesLabel(minutes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draftDate, draftStart === "now" ? null : draftStart);
              setOpen(false);
            }}
          >
            OK
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
