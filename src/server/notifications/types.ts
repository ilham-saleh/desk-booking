/**
 * In-app notification types and their stored payloads (Notification.payload).
 * Payloads carry the site time zone so they render in workplace time without
 * extra lookups; `booking.autoCancelled` rows written before that was added
 * fall back to a booking lookup (see listNotifications).
 */
export const NOTIFICATION_TYPES = {
  deskWatchAvailable: "deskWatch.available",
  checkInReminder: "booking.checkInReminder",
  autoCancelled: "booking.autoCancelled",
} as const;

interface DeskLocation {
  deskId: string;
  deskNumber: string;
  floorId: string;
  floorName: string;
  siteId: string;
  siteName: string;
  timeZone: string;
}

export interface DeskWatchAvailablePayload extends DeskLocation {
  /** Site-local date, YYYY-MM-DD. */
  date: string;
  freedStartAt: string;
  freedEndAt: string;
  /** False when the desk was released mid-booking, so the map should open on "now". */
  slotAligned: boolean;
}

export interface CheckInReminderPayload extends DeskLocation {
  bookingId: string;
  startAt: string;
  endAt: string;
  deadlineAt: string;
  /** Set when the reminder goes to the person who booked for a guest. */
  guestName: string | null;
}

export interface AutoCancelledPayload extends Partial<DeskLocation> {
  bookingId: string;
  deskNumber: string;
  startAt: string;
  endAt: string;
}
