import { TRPCError } from "@trpc/server";

import type { CancelBookingInput } from "@/lib/schemas/booking";
import { BookingStatus } from "@/generated/prisma/enums";
import { isSiteAdminRole, type Session } from "@/server/auth/roles";
import { assertSiteAdmin } from "@/server/api/trpc";
import type { ScopedDb } from "@/server/tenancy";

const TERMINAL_STATUSES: BookingStatus[] = [BookingStatus.CANCELLED, BookingStatus.AUTO_CANCELLED, BookingStatus.COMPLETED];

/** Cancellation, allowed any time before start (CLAUDE.md rule 5); audited (rule 13). */
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
  const isOwner = booking.userId === actorId || booking.bookedById === actorId;
  if (!isOwner) {
    if (!isSiteAdminRole(ctx.session)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only cancel your own bookings." });
    }
    await assertSiteAdmin(ctx, booking.desk.floor.siteId);
  }

  if (TERMINAL_STATUSES.includes(booking.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This booking is already cancelled or completed." });
  }
  if (booking.startAt.getTime() <= Date.now()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This booking has already started and can no longer be cancelled." });
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
