import { currentMinutesInTimeZone } from "@/lib/time-slots";

/**
 * Deep-link query that opens the Floor Map on this booking's site/floor/date and start time with the desk
 * highlighted. The map evaluates from the start until closing, so no end is passed; a start that has
 * already passed (an ongoing booking) shows as "Now".
 */
export function locateOnMapQuery(booking: {
  deskId: string;
  startAt: Date;
  desk: { floor: { id: string; siteId: string; site: { timeZone: string } } };
}): Record<string, string> {
  const timeZone = booking.desk.floor.site.timeZone;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(booking.startAt),
  );
  return {
    site: booking.desk.floor.siteId,
    floor: booking.desk.floor.id,
    desk: booking.deskId,
    date,
    start: String(currentMinutesInTimeZone(timeZone, new Date(booking.startAt))),
  };
}
