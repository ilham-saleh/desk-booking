import { TRPCError } from "@trpc/server";

import type { CancelBookingInput } from "@/lib/schemas/booking";
import { BookingStatus } from "@/generated/prisma/enums";
import type { Session } from "@/server/auth/roles";
import { assertCanManageBooking } from "@/server/auth/authorization";
import type { ScopedDb } from "@/server/tenancy";

const TERMINAL_STATUSES: BookingStatus[] = [BookingStatus.CANCELLED, BookingStatus.AUTO_CANCELLED, BookingStatus.COMPLETED];

/**
 * Cancellation of a booking that hasn't started yet (a booking in progress is
 * released with `endBookingEarly` instead); audited (CLAUDE.md rule 13).
 * Owner, or an admin managing the desk's site — see `canManageBooking`.
 */
export async function cancelBooking(
  ctx: { db: ScopedDb; session: Session; organizationId: string },
  input: CancelBookingInput,
) {
  const booking = await ctx.db.booking.findUnique({
    where: { id: input.bookingId },
    include: { desk: { include: { floor: true } } },
  });
  if (!booking) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." });
  }

  const actorId = ctx.session.user.id;
  await assertCanManageBooking(ctx, booking, booking.desk.floor.siteId, "cancel");

  if (TERMINAL_STATUSES.includes(booking.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This booking is already cancelled or completed." });
  }
  if (booking.startAt.getTime() <= Date.now()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This booking has already started — use End Booking to release the desk.",
    });
  }

  const cancelled = await ctx.db.booking.update({
    where: { id: booking.id },
    data: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), cancelledById: actorId },
  });

  await ctx.db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorId,
      action: "booking.cancel",
      targetType: "Booking",
      targetId: booking.id,
      before: { status: booking.status },
      after: { status: BookingStatus.CANCELLED },
    },
  });

  return cancelled;
}
