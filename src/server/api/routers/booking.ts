import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  cancelBookingInputSchema,
  checkInInputSchema,
  createBookingInputSchema,
  dateStringSchema,
  endBookingInputSchema,
  timeSlotMinutesSchema,
} from "@/lib/schemas/booking";
import { createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { cancelBooking } from "@/server/booking/cancel-booking";
import { checkInToBooking } from "@/server/booking/check-in";
import { createBooking } from "@/server/booking/create-booking";
import { ACTIVE_BOOKING_STATUSES, computeDeskState, isDeskFreeForRange } from "@/server/booking/desk-state";
import { endBookingEarly } from "@/server/booking/end-booking";
import { zonedDateTimeToUtc } from "@/server/booking/time";

const getFloorAvailabilityInput = z
  .object({
    floorId: z.string().min(1),
    date: dateStringSchema,
    startMinutes: timeSlotMinutesSchema.optional(),
    endMinutes: timeSlotMinutesSchema.optional(),
  })
  .refine((input) => (input.startMinutes === undefined) === (input.endMinutes === undefined), {
    message: "Provide both startMinutes and endMinutes, or neither",
  });

export const bookingRouter = createTRPCRouter({
  /**
   * Per-desk live state for one floor/date — feeds both the plain floor-map
   * viewer (no startMinutes/endMinutes) and the "Book a Desk" flow's
   * highlight-eligible-desks step (with them). Polled by the client rather
   * than pushed — see CLAUDE.md rule 2, realtime is display only.
   */
  getFloorAvailability: orgProcedure.input(getFloorAvailabilityInput).query(async ({ ctx, input }) => {
    const floor = await ctx.db.floor.findUnique({
      where: { id: input.floorId },
      include: { site: true, desks: true },
    });
    if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

    const dayStart = zonedDateTimeToUtc(input.date, 0, floor.site.timeZone);
    const dayEnd = zonedDateTimeToUtc(input.date, 24 * 60, floor.site.timeZone);
    const bookings = await ctx.db.booking.findMany({
      where: { deskId: { in: floor.desks.map((desk) => desk.id) }, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      include: { user: { select: { name: true } } },
    });

    const requestedRange =
      input.startMinutes !== undefined && input.endMinutes !== undefined
        ? {
            start: zonedDateTimeToUtc(input.date, input.startMinutes, floor.site.timeZone),
            end: zonedDateTimeToUtc(input.date, input.endMinutes, floor.site.timeZone),
          }
        : null;

    const now = new Date();
    const desks = floor.desks.map((desk) => {
      const deskBookings = bookings.filter((booking) => booking.deskId === desk.id);
      const activeBookings = deskBookings.filter((booking) => ACTIVE_BOOKING_STATUSES.includes(booking.status));
      return {
        deskId: desk.id,
        state: computeDeskState(desk, deskBookings, now),
        freeForRequestedSlot: requestedRange
          ? isDeskFreeForRange(deskBookings, requestedRange.start, requestedRange.end)
          : undefined,
        bookings: activeBookings.map((booking) => ({
          id: booking.id,
          status: booking.status,
          userId: booking.userId,
          bookedById: booking.bookedById,
          startAt: booking.startAt,
          endAt: booking.endAt,
          occupantLabel: booking.user?.name ?? booking.guestName ?? "Guest",
        })),
      };
    });

    return { now, desks };
  }),

  create: orgProcedure.input(createBookingInputSchema).mutation(({ ctx, input }) => createBooking(ctx, input)),

  cancel: orgProcedure.input(cancelBookingInputSchema).mutation(({ ctx, input }) => cancelBooking(ctx, input)),

  checkIn: orgProcedure.input(checkInInputSchema).mutation(({ ctx, input }) => checkInToBooking(ctx, input)),

  endBooking: orgProcedure.input(endBookingInputSchema).mutation(({ ctx, input }) => endBookingEarly(ctx, input)),

  /**
   * Split by whether the booking still occupies a slot (status active AND
   * endAt in the future) rather than by startAt alone — a booking in
   * progress right now, or one cancelled ahead of a future start date,
   * would otherwise fall through both "upcoming" and "past".
   */
  listMine: orgProcedure
    .input(z.object({ when: z.enum(["upcoming", "past"]) }))
    .query(({ ctx, input }) => {
      const now = new Date();
      const isCurrentlyActive = { status: { in: ACTIVE_BOOKING_STATUSES }, endAt: { gt: now } };
      return ctx.db.booking.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(input.when === "upcoming" ? isCurrentlyActive : { NOT: isCurrentlyActive }),
        },
        orderBy: { startAt: input.when === "upcoming" ? "asc" : "desc" },
        include: { desk: { include: { floor: { include: { site: true } } } } },
      });
    }),
});
