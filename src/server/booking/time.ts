import { fromZonedTime } from "date-fns-tz";

export { SLOT_MINUTES, isWeekday } from "@/lib/time-slots";

/**
 * Converts a site-local wall-clock date + minutes-from-midnight into the UTC
 * instant it represents (CLAUDE.md rule 3: "Store UTC; display in the site's
 * time zone"). This is the only place that instant gets constructed, so every
 * booking's startAt/endAt goes through the same IANA-timezone-aware math.
 */
export function zonedDateTimeToUtc(dateStr: string, minutesFromMidnight: number, timeZone: string): Date {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const wallClock = `${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  return fromZonedTime(wallClock, timeZone);
}
