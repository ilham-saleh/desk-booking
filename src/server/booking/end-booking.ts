import { TRPCError } from "@trpc/server";

import type { EndBookingInput } from "@/lib/schemas/booking";
import { BookingStatus } from "@/generated/prisma/enums";
import type { Session } from "@/server/auth/roles";
import { assertCanManageBooking } from "@/server/auth/authorization";
import { notifyDeskWatchers } from "@/server/notifications/desk-watch";
import type { ScopedDb } from "@/server/tenancy";

/**
 * Releases a desk before the booking's scheduled end time: either a
 * checked-in booking (any time after check-in) or a confirmed booking that is
 * already in progress. A booking that hasn't started is cancelled instead
 * (`cancelBooking`). Allowed for the owner, or for an admin managing the
 * desk's site — e.g. a Facility Admin ending another employee's booking so
 * the desk frees up.
 *
 * `endAt` is left as originally booked (a historical record) — COMPLETED
 * already falls outside ACTIVE_BOOKING_STATUSES, so the desk frees
 * immediately regardless. Audited (CLAUDE.md rule 13), recording the actor.
 */
export async function endBookingEarly(
  ctx: { db: ScopedDb; session: Session; organizationId: string },
  input: EndBookingInput,
) {
  const booking = await ctx.db.booking.findUnique({
    where: { id: input.bookingId },
    include: { desk: { include: { floor: true } } },
  });
  if (!booking) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  }

  const actorId = ctx.session.user.id;
  await assertCanManageBooking(ctx, booking, booking.desk.floor.siteId, "end");

  const now = Date.now();
  const inProgress = booking.startAt.getTime() <= now && now < booking.endAt.getTime();
  if (booking.status === BookingStatus.CONFIRMED && !inProgress) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        booking.startAt.getTime() > now
          ? "This booking hasn't started yet — cancel it instead."
          : "This booking has already ended.",
    });
  }
  if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.CHECKED_IN) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This booking is already cancelled or completed." });
  }

  const completed = await ctx.db.booking.update({
    where: { id: booking.id },
    data: { status: BookingStatus.COMPLETED },
  });

  await ctx.db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorId,
      action: "booking.endEarly",
      targetType: "Booking",
      targetId: booking.id,
      before: { status: booking.status, userId: booking.userId, bookedById: booking.bookedById },
      after: { status: BookingStatus.COMPLETED, endedByOwner: booking.userId === actorId || booking.bookedById === actorId },
    },
  });

  await notifyDeskWatchers(ctx.db, completed, { releasedEarly: true, actorId });

  return completed;
}
