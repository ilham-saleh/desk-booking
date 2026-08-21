/**
 * Pure time-slot helpers shared by the booking forms (client) and the
 * booking validation/creation logic (server) — CLAUDE.md rule 3: "Dropdown
 * start/end", 30-minute increments, weekdays only.
 */

export const SLOT_MINUTES = 30;

/** Selectable minutes-from-midnight values between a site's operating hours, inclusive. */
export function buildTimeOptions(operatingHoursStart: number, operatingHoursEnd: number): number[] {
  const options: number[] = [];
  for (let minutes = operatingHoursStart; minutes <= operatingHoursEnd; minutes += SLOT_MINUTES) {
    options.push(minutes);
  }
  return options;
}

/** "09:00" for 540. */
export function formatMinutesLabel(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * A booking's `date` is already a plain site-local calendar date (rule 3), so
 * weekday-ness never depends on time zone — it's decided by the calendar
 * itself, not by any instant-in-time conversion.
 */
export function isWeekday(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

/** Today's date as `YYYY-MM-DD` in the given time zone — used as the date picker's min. */
export function todayInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}
