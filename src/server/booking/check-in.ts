import { TRPCError } from "@trpc/server";

import type { CheckInInput } from "@/lib/schemas/booking";
import { BookingStatus } from "@/generated/prisma/enums";
import { isSiteAdminRole, type Session } from "@/server/auth/roles";
import { assertSiteAdmin } from "@/server/api/trpc";
import type { ScopedDb } from "@/server/tenancy";

/** Check-in, keeping a desk that requires it (CLAUDE.md rule 6); audited (rule 13). */
export async function checkInToBooking(
  ctx: { db: ScopedDb; session: Session; organizationId: string },
  input: CheckInInput,
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
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only check in to your own bookings." });
    }
    await assertSiteAdmin(ctx, booking.desk.floor.siteId);
  }

  if (booking.status !== BookingStatus.CONFIRMED) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This booking is already checked in, cancelled, or completed." });
  }
  if (!booking.desk.requiresCheckIn) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This desk doesn't require check-in." });
  }
  if (booking.endAt.getTime() <= Date.now()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This booking has already ended." });
  }

  const checkedIn = await ctx.db.booking.update({
    where: { id: booking.id },
    data: { status: BookingStatus.CHECKED_IN, checkedInAt: new Date() },
  });

  await ctx.db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorId,
      action: "booking.checkIn",
      targetType: "Booking",
      targetId: booking.id,
      before: { status: booking.status },
      after: { status: BookingStatus.CHECKED_IN },
    },
  });

  return checkedIn;
}
