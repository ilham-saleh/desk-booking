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

type SiteHours = { timeZone: string; operatingHoursStart: number; operatingHoursEnd: number };

/**
 * Start times the Floor Map offers for a site-local date. Past times are never
 * offered: on today, `nowSlot` is the slot containing the current time (shown
 * as "Now", null when the site isn't open right now) and `options` only holds
 * slots that start later. The last start leaves one slot before closing.
 */
export function mapStartOptions(date: string, site: SiteHours, now: Date = new Date()): { nowSlot: number | null; options: number[] } {
  const all = buildTimeOptions(site.operatingHoursStart, site.operatingHoursEnd - SLOT_MINUTES);
  const today = todayInTimeZone(site.timeZone, now);
  if (date < today) return { nowSlot: null, options: [] };
  if (date > today) return { nowSlot: null, options: all };

  const nowMinutes = currentMinutesInTimeZone(site.timeZone, now);
  const slot = Math.floor(nowMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  const open = nowMinutes >= site.operatingHoursStart && slot <= site.operatingHoursEnd - SLOT_MINUTES;
  return { nowSlot: open ? slot : null, options: all.filter((minutes) => minutes > nowMinutes) };
}

/** A date the Floor Map can show: a weekday (bookings are weekday-only) that still has a start time left. */
export function isMapDateSelectable(date: string, site: SiteHours, now: Date = new Date()): boolean {
  if (!isWeekday(date)) return false;
  const { nowSlot, options } = mapStartOptions(date, site, now);
  return nowSlot !== null || options.length > 0;
}

/** The Floor Map's default date: today, or the next weekday once today has no start times left. */
export function firstMapDate(site: SiteHours, now: Date = new Date()): string {
  const today = todayInTimeZone(site.timeZone, now);
  let date = today;
  for (let day = 0; day < 14 && !isMapDateSelectable(date, site, now); day += 1) {
    const [y, m, d] = today.split("-").map(Number) as [number, number, number];
    date = new Date(Date.UTC(y, m - 1, d + day + 1)).toISOString().slice(0, 10);
  }
  return date;
}

/**
 * The window the Floor Map evaluates for a chosen start: from that start until
 * the site closes, so "Available" means bookable for the rest of the day. A
 * null or no-longer-offered start falls back to "Now" (today) or opening time.
 */
export function mapTimeWindow(
  date: string,
  startMinutes: number | null,
  site: SiteHours,
  now: Date = new Date(),
): { startMinutes: number; endMinutes: number; isNow: boolean } | null {
  const { nowSlot, options } = mapStartOptions(date, site, now);
  const explicit = startMinutes !== null && (startMinutes === nowSlot || options.includes(startMinutes)) ? startMinutes : null;
  const start = explicit ?? nowSlot ?? options[0];
  if (start === undefined) return null;
  return { startMinutes: start, endMinutes: site.operatingHoursEnd, isNow: start === nowSlot };
}
