import {
  NOTIFICATION_TYPES,
  type AutoCancelledPayload,
  type CheckInReminderPayload,
  type DeskWatchAvailablePayload,
} from "@/server/notifications/types";

export interface FormattedNotification {
  title: string;
  body: string;
  /** In-app link the notification opens. */
  href: string;
}

const time = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));

const dayOf = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone }).format(new Date(iso));

/** A YYYY-MM-DD calendar date, formatted without shifting it through any time zone. */
const calendarDay = (date: string) => dayOf(`${date}T12:00:00Z`, "UTC");

function minutesInZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).formatToParts(
    new Date(iso),
  );
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/**
 * Turns a stored notification into display text, in the site's time zone.
 * `fallbackTimeZone` is used for older payloads that predate `timeZone`.
 */
export function formatNotification(type: string, payload: unknown, fallbackTimeZone?: string): FormattedNotification {
  const p = (payload ?? {}) as Record<string, unknown>;

  switch (type) {
    case NOTIFICATION_TYPES.deskWatchAvailable: {
      const w = p as unknown as DeskWatchAvailablePayload;
      const query = new URLSearchParams({ site: w.siteId, floor: w.floorId, desk: w.deskId, date: w.date });
      if (w.slotAligned) query.set("start", String(minutesInZone(w.freedStartAt, w.timeZone)));
      return {
        title: `Desk ${w.deskNumber} is free`,
        body: `It's now free on ${calendarDay(w.date)}, ${time(w.freedStartAt, w.timeZone)}–${time(w.freedEndAt, w.timeZone)} (${w.floorName.trim()} · ${w.siteName.trim()}).`,
        href: `/floor-map?${query}`,
      };
    }
    case NOTIFICATION_TYPES.checkInReminder: {
      const r = p as unknown as CheckInReminderPayload;
      const whose = r.guestName ? `${r.guestName}'s booking` : "your booking";
      return {
        title: `Check in to Desk ${r.deskNumber}`,
        body: `Check in by ${time(r.deadlineAt, r.timeZone)} or ${whose} on ${dayOf(r.startAt, r.timeZone)}, ${time(r.startAt, r.timeZone)}–${time(r.endAt, r.timeZone)} will be released.`,
        href: "/bookings",
      };
    }
    case NOTIFICATION_TYPES.autoCancelled: {
      const a = p as unknown as AutoCancelledPayload;
      const timeZone = a.timeZone ?? fallbackTimeZone ?? "UTC";
      return {
        title: `Desk ${a.deskNumber} was released`,
        body: `It wasn't checked in on time, so the booking on ${dayOf(a.startAt, timeZone)}, ${time(a.startAt, timeZone)}–${time(a.endAt, timeZone)} was cancelled.`,
        href: "/bookings",
      };
    }
    default:
      return { title: "Notification", body: "", href: "/home" };
  }
}
