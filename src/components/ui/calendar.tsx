"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatDisplayDate, shiftIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** "2026-10" for "2026-10-14". */
export const monthOf = (iso: string) => iso.slice(0, 7);

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Monday-first weeks covering `month`, padded with the neighbouring months' days. */
function calendarWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks: string[][] = [];
  for (let week = 0; week < Math.ceil((offset + daysInMonth) / 7); week += 1) {
    weeks.push(Array.from({ length: 7 }, (_, day) => shiftIsoDate(first, week * 7 + day - offset)));
  }
  return weeks;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** The first selectable day on or after `from`, looking up to `days` ahead. */
export function nextSelectableDate(from: string, isSelectable: (iso: string) => boolean, days = 366): string | null {
  for (let step = 0; step <= days; step += 1) {
    const day = shiftIsoDate(from, step);
    if (isSelectable(day)) return day;
  }
  return null;
}

/**
 * Month calendar over plain YYYY-MM-DD calendar dates (no time zone maths —
 * the caller decides "today" and which days are selectable, in the site's
 * zone). Monday-first, keyboard navigable (arrow keys skip unavailable days),
 * with a Today shortcut. Mount it fresh per open: it starts on the selected
 * day's month.
 */
export function Calendar({
  selected,
  today,
  isSelectable,
  onSelect,
  className,
}: {
  selected: string;
  today: string;
  isSelectable: (iso: string) => boolean;
  onSelect: (iso: string) => void;
  className?: string;
}) {
  const [month, setMonth] = useState(monthOf(selected || today));
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Arrow-key moves can cross into another month; focus the target once that month has rendered.
  useEffect(() => {
    if (!focusDate) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate, month]);

  function select(day: string) {
    if (!isSelectable(day)) return;
    if (monthOf(day) !== month) setMonth(monthOf(day));
    onSelect(day);
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = deltas[event.key];
    const from = (event.target as HTMLElement).dataset.date;
    if (delta === undefined || !from) return;
    event.preventDefault();
    let target = shiftIsoDate(from, delta);
    for (let step = 0; step < 14 && !isSelectable(target); step += 1) {
      target = shiftIsoDate(target, Math.sign(delta));
    }
    if (!isSelectable(target)) return;
    if (monthOf(target) !== month) setMonth(monthOf(target));
    setFocusDate(target);
  }

  const weeks = calendarWeeks(month);
  const todayTarget = nextSelectableDate(today, isSelectable);
  // The one day that takes Tab focus inside the grid (roving tabindex): the selection, else the first open day.
  const tabbableDate =
    monthOf(selected) === month && isSelectable(selected)
      ? selected
      : (weeks.flat().find((day) => monthOf(day) === month && isSelectable(day)) ?? null);

  return (
    <div className={className}>
      <div className="flex items-center gap-1 border-b px-4 py-3">
        <p className="type-card-title flex-1" aria-live="polite">
          {monthLabel(month)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 text-xs font-semibold tracking-[0.04em] uppercase"
          disabled={!todayTarget}
          onClick={() => todayTarget && select(todayTarget)}
        >
          Today
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" disabled={month <= monthOf(today)} onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="px-3 pt-3 pb-2">
        <div className="text-muted-foreground mb-1 grid grid-cols-7 text-center text-xs font-medium" aria-hidden>
          {WEEKDAYS.map((day) => (
            <span key={day} className="py-1">
              {day}
            </span>
          ))}
        </div>
        <div ref={gridRef} role="grid" aria-label={monthLabel(month)} onKeyDown={onGridKeyDown} className="grid gap-y-1">
          {weeks.map((week) => (
            <div key={week[0]} role="row" className="grid grid-cols-7">
              {week.map((day) => {
                const selectable = monthOf(day) === month && isSelectable(day);
                const isSelected = day === selected;
                const isToday = day === today;
                return (
                  <div key={day} role="gridcell" aria-selected={isSelected} className="flex justify-center">
                    <button
                      type="button"
                      data-date={day}
                      disabled={!selectable}
                      tabIndex={day === tabbableDate ? 0 : -1}
                      aria-label={`${formatDisplayDate(day, { year: true })}${isToday ? " (today)" : ""}${selectable ? "" : ", unavailable"}`}
                      aria-pressed={isSelected}
                      onClick={() => select(day)}
                      className={cn(
                        "focus-visible:ring-cyan/40 flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2",
                        isSelected
                          ? "bg-navy font-semibold text-white"
                          : selectable
                            ? "text-foreground hover:bg-navy-soft hover:text-navy"
                            : "text-muted-foreground/45 cursor-default",
                        isToday && !isSelected && "ring-cyan/70 font-semibold ring-1",
                      )}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
