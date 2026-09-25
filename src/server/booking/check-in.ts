import { TRPCError } from "@trpc/server";

import type { CheckInInput } from "@/lib/schemas/booking";
import { BookingStatus } from "@/generated/prisma/enums";
import type { Session } from "@/server/auth/roles";
import { assertCanManageBooking } from "@/server/auth/authorization";
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
  await assertCanManageBooking(ctx, booking, booking.desk.floor.siteId, "check in to");

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
