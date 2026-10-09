import type { PrismaClient } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/enums";
import { notifyDeskWatchers } from "@/server/notifications/desk-watch";
import { NOTIFICATION_TYPES, type AutoCancelledPayload } from "@/server/notifications/types";

/** Not checked in within this many minutes after the booking starts → auto-cancelled. */
export const CHECK_IN_DEADLINE_MINUTES = 60;

/**
 * When a booking must be checked in by: CHECK_IN_DEADLINE_MINUTES after it
 * starts, or after it was made if that was later (booking the current slot
 * late still gets the full hour).
 */
export function checkInDeadline(booking: { startAt: Date; createdAt: Date }): Date {
  return new Date(Math.max(booking.startAt.getTime(), booking.createdAt.getTime()) + CHECK_IN_DEADLINE_MINUTES * 60_000);
}

/**
 * Sweeps CONFIRMED bookings on check-in-required desks whose check-in
 * deadline (see checkInDeadline) has passed without a check-in,
 * auto-cancelling them and releasing the desk for the rest of the booking
 * (CLAUDE.md rule 6). Run on a recurring pg-boss schedule from jobs/worker.ts.
 *
 * No request/session here, so writes go through the raw PrismaClient — but
 * every audit/notification write is still scoped to that row's own
 * organizationId (rule 1), and the conditional per-row updateMany (only
 * transitioning a row that's still CONFIRMED/not checked in) guards the
 * race against a concurrent check-in without needing a serializable
 * transaction, mirroring create-booking.ts's "friendly pre-check, DB
 * enforces it" pattern.
 */
export async function runCheckInAutoCancelSweep(db: PrismaClient): Promise<number> {
  // checkInDeadline() <= now  ⟺  both startAt and createdAt are at least CHECK_IN_DEADLINE_MINUTES ago.
  const cutoff = new Date(Date.now() - CHECK_IN_DEADLINE_MINUTES * 60_000);

  const candidates = await db.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      checkedInAt: null,
      startAt: { lte: cutoff },
      createdAt: { lte: cutoff },
      desk: { requiresCheckIn: true },
    },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      bookedById: true,
      deskId: true,
      date: true,
      startAt: true,
      endAt: true,
      desk: { select: { number: true, floor: { select: { id: true, name: true, site: { select: { id: true, name: true, timeZone: true } } } } } },
    },
  });

  let cancelledCount = 0;

  for (const booking of candidates) {
    const now = new Date();
    const { count } = await db.booking.updateMany({
      where: { id: booking.id, status: BookingStatus.CONFIRMED, checkedInAt: null },
      data: { status: BookingStatus.AUTO_CANCELLED, cancelledAt: now },
    });
    if (count !== 1) continue;
    cancelledCount++;

    await db.auditLog.create({
      data: {
        organizationId: booking.organizationId,
        actorId: null,
        action: "booking.autoCancel",
        targetType: "Booking",
        targetId: booking.id,
        before: { status: BookingStatus.CONFIRMED },
        after: { status: BookingStatus.AUTO_CANCELLED },
      },
    });

    const notifyUserId = booking.userId ?? booking.bookedById;
    const payload: AutoCancelledPayload = {
      bookingId: booking.id,
      deskId: booking.deskId,
      deskNumber: booking.desk.number,
      floorId: booking.desk.floor.id,
      floorName: booking.desk.floor.name,
      siteId: booking.desk.floor.site.id,
      siteName: booking.desk.floor.site.name,
      timeZone: booking.desk.floor.site.timeZone,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
    };
    await db.notification.create({
      data: { organizationId: booking.organizationId, userId: notifyUserId, type: NOTIFICATION_TYPES.autoCancelled, payload: { ...payload } },
    });

    // The booking had already started, so the desk is free from now until its end.
    await notifyDeskWatchers(db, booking, { releasedEarly: true, actorId: null });
  }

  return cancelledCount;
}
