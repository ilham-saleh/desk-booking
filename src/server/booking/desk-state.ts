import { BookingStatus, DeskState } from "@/generated/prisma/enums";

export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];

export interface DeskStateInput {
  isActive: boolean;
}

export interface BookingStateInput {
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
}

/** A half-open [start, end) instant range the viewer is asking about. */
export interface TimeWindow {
  start: Date;
  end: Date;
}

/**
 * A desk's map state for a requested time window: INACTIVE overrides
 * everything; BOOKED means an active booking overlaps the window; otherwise
 * AVAILABLE. A booking only makes the desk busy for its own [startAt, endAt)
 * — outside that range other people can still book the desk — so a booking
 * for tomorrow never colours today's map, and a 09:00–10:00 booking leaves
 * the desk available from 10:00 onwards.
 *
 * `DeskState.SCHEDULED` is no longer produced (it used to mark a desk as
 * taken for the whole day as soon as any later booking existed). The enum
 * value is kept so existing rows/clients need no migration.
 */
export function computeDeskState(desk: DeskStateInput, bookings: BookingStateInput[], window: TimeWindow): DeskState {
  if (!desk.isActive) return DeskState.INACTIVE;
  return isDeskFreeForRange(bookings, window.start, window.end) ? DeskState.AVAILABLE : DeskState.BOOKED;
}

/** Whether a desk is free for an arbitrary requested [startAt, endAt) range — shared by the map, "Book a Desk" and booking creation. */
export function isDeskFreeForRange(bookings: BookingStateInput[], requestedStart: Date, requestedEnd: Date): boolean {
  return !bookings.some((booking) => bookingOverlapsRange(booking, requestedStart, requestedEnd));
}

/** An active booking that occupies any part of [requestedStart, requestedEnd). */
export function bookingOverlapsRange(booking: BookingStateInput, requestedStart: Date, requestedEnd: Date): boolean {
  return (
    ACTIVE_BOOKING_STATUSES.includes(booking.status) && booking.startAt < requestedEnd && requestedStart < booking.endAt
  );
}
