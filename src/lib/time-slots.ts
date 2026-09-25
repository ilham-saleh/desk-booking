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

/** The current wall-clock time in the given time zone, as minutes from midnight. */
export function currentMinutesInTimeZone(timeZone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(
    now,
  );
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** How far ahead of "now" the Floor Map looks by default when viewing today. */
export const DEFAULT_WINDOW_MINUTES = 60;

/**
 * The Floor Map's default time window for a date: today → the current slot
 * plus the next hour ("is it free right now"); any other date → the whole
 * operating day. Clamped so the window always stays at least one slot inside
 * operating hours, even after the site has closed for the day.
 */
export function defaultTimeWindow(
  date: string,
  site: { timeZone: string; operatingHoursStart: number; operatingHoursEnd: number },
  now: Date = new Date(),
): { startMinutes: number; endMinutes: number } {
  if (date !== todayInTimeZone(site.timeZone, now)) {
    return { startMinutes: site.operatingHoursStart, endMinutes: site.operatingHoursEnd };
  }
  const lastStart = site.operatingHoursEnd - SLOT_MINUTES;
  const nowMinutes = currentMinutesInTimeZone(site.timeZone, now);
  const currentSlot = Math.floor(nowMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  const startMinutes = Math.min(Math.max(currentSlot, site.operatingHoursStart), lastStart);
  const endMinutes = Math.min(startMinutes + DEFAULT_WINDOW_MINUTES, site.operatingHoursEnd);
  return { startMinutes, endMinutes };
}

/** Today's date as `YYYY-MM-DD` in the given time zone — used as the date picker's min. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
