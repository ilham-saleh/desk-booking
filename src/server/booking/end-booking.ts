import { TRPCError } from "@trpc/server";

import type { EndBookingInput } from "@/lib/schemas/booking";
import { BookingStatus } from "@/generated/prisma/enums";
import { isSiteAdminRole, type Session } from "@/server/auth/roles";
import { assertSiteAdmin } from "@/server/api/trpc";
import type { ScopedDb } from "@/server/tenancy";

/**
 * Releases a checked-in desk before its scheduled end time. `endAt` is left
 * as originally booked (a historical record) — COMPLETED already falls
 * outside ACTIVE_BOOKING_STATUSES, so the desk frees immediately regardless.
 * Audited (CLAUDE.md rule 13).
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
  const isOwner = booking.userId === actorId || booking.bookedById === actorId;
  if (!isOwner) {
    if (!isSiteAdminRole(ctx.session)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only end your own bookings." });
    }
    await assertSiteAdmin(ctx, booking.desk.floor.siteId);
  }

  if (booking.status !== BookingStatus.CHECKED_IN) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only a checked-in booking can be ended early." });
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
      before: { status: booking.status },
      after: { status: BookingStatus.COMPLETED },
    },
  });

  return completed;
}
