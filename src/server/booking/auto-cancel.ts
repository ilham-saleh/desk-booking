import type { PrismaClient } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/enums";

/** Spec section C: not checked in by this many minutes before start → auto-cancelled. Configurable. */
export const CHECK_IN_DEADLINE_MINUTES = 60;

/**
 * Sweeps CONFIRMED bookings on check-in-required desks whose check-in
 * deadline (start - CHECK_IN_DEADLINE_MINUTES) has arrived without a
 * check-in, auto-cancelling them and releasing the desk (CLAUDE.md rule 6).
 * Run on a recurring pg-boss schedule from jobs/worker.ts.
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
  const deadline = new Date(Date.now() + CHECK_IN_DEADLINE_MINUTES * 60_000);

  const candidates = await db.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      checkedInAt: null,
      startAt: { lte: deadline },
      desk: { requiresCheckIn: true },
    },
    select: { id: true, organizationId: true, userId: true, bookedById: true, deskId: true, startAt: true, endAt: true, desk: { select: { number: true } } },
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
    await db.notification.create({
      data: {
        organizationId: booking.organizationId,
        userId: notifyUserId,
        type: "booking.autoCancelled",
        payload: {
          bookingId: booking.id,
          deskNumber: booking.desk.number,
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
        },
      },
    });
  }

  return cancelledCount;
}
