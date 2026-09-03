import { fromZonedTime } from "date-fns-tz";

export { SLOT_MINUTES, isWeekday } from "@/lib/time-slots";

/**
 * Converts a site-local wall-clock date + minutes-from-midnight into the UTC
 * instant it represents (CLAUDE.md rule 3: "Store UTC; display in the site's
 * time zone"). This is the only place that instant gets constructed, so every
 * booking's startAt/endAt goes through the same IANA-timezone-aware math.
 *
 * minutesFromMidnight may be exactly 24*60 (end-of-day, used by callers that
 * need "start of the next day" as an exclusive bound) — that rolls over to
 * 00:00 on the following date, since "24:00:00" isn't a valid wall-clock
 * hour and would otherwise silently collapse to the same instant as 00:00
 * on dateStr itself.
 */
export function zonedDateTimeToUtc(dateStr: string, minutesFromMidnight: number, timeZone: string): Date {
  const dayMinutes = 24 * 60;
  const daysToAdd = Math.floor(minutesFromMidnight / dayMinutes);
  const remainder = minutesFromMidnight % dayMinutes;
  const hours = Math.floor(remainder / 60);
  const minutes = remainder % 60;

  const rolledDate = new Date(`${dateStr}T00:00:00Z`);
  rolledDate.setUTCDate(rolledDate.getUTCDate() + daysToAdd);
  const rolledDateStr = rolledDate.toISOString().slice(0, 10);

  const wallClock = `${rolledDateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  return fromZonedTime(wallClock, timeZone);
}
