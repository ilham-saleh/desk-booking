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

/**
 * A desk's map state (CLAUDE.md rule 14 / spec module D): INACTIVE overrides
 * everything; BOOKED means an active booking's range contains `now`;
 * SCHEDULED means an active booking exists later the same date; else
 * AVAILABLE. `bookingsForDate` should already be scoped to the one date
 * being viewed — this function doesn't filter by date itself.
 */
export function computeDeskState(desk: DeskStateInput, bookingsForDate: BookingStateInput[], now: Date): DeskState {
  if (!desk.isActive) return DeskState.INACTIVE;

  const active = bookingsForDate.filter((booking) => ACTIVE_BOOKING_STATUSES.includes(booking.status));
  if (active.some((booking) => booking.startAt <= now && now < booking.endAt)) return DeskState.BOOKED;
  if (active.some((booking) => booking.startAt > now)) return DeskState.SCHEDULED;
  return DeskState.AVAILABLE;
}

/** Whether a desk is free for an arbitrary requested [startAt, endAt) range — used by the "Book a Desk" flow. */
export function isDeskFreeForRange(
  bookingsForDate: BookingStateInput[],
  requestedStart: Date,
  requestedEnd: Date,
): boolean {
  return !bookingsForDate.some(
    (booking) =>
      ACTIVE_BOOKING_STATUSES.includes(booking.status) && booking.startAt < requestedEnd && requestedStart < booking.endAt,
  );
}
