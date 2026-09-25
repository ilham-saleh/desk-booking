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
import { canBookForUser, canManageSite } from "@/server/auth/authorization";
import { cancelBooking } from "@/server/booking/cancel-booking";
import { checkInToBooking } from "@/server/booking/check-in";
import { createBooking } from "@/server/booking/create-booking";
import { ACTIVE_BOOKING_STATUSES, computeDeskState, isDeskFreeForRange } from "@/server/booking/desk-state";
import { eligibilityDeskInclude, evaluateDeskEligibility } from "@/server/booking/eligibility";
import { endBookingEarly } from "@/server/booking/end-booking";
import { zonedDateTimeToUtc } from "@/server/booking/time";
import { todayInTimeZone } from "@/lib/time-slots";

const getFloorAvailabilityInput = z
  .object({
    floorId: z.string().min(1),
    date: dateStringSchema,
    startMinutes: timeSlotMinutesSchema.optional(),
    endMinutes: timeSlotMinutesSchema.optional(),
    /** Evaluate restriction eligibility for this occupant instead of the viewer (book-on-behalf flows). */
    occupantUserId: z.string().min(1).optional(),
    /** Evaluate restriction eligibility for a guest (only unrestricted desks qualify). */
    forGuest: z.boolean().optional(),
  })
  .refine((input) => (input.startMinutes === undefined) === (input.endMinutes === undefined), {
    message: "Provide both startMinutes and endMinutes, or neither",
  })
  .refine((input) => !(input.forGuest && input.occupantUserId), { message: "Choose a user or a guest, not both" });

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
      include: { site: true, desks: { where: { archivedAt: null }, include: eligibilityDeskInclude } },
    });
    if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });

    // Restricted state is per occupant: the signed-in user by default, or — for
    // someone allowed to book on behalf at this site — the chosen employee or a guest.
    const viewerId = ctx.session.user.id;
    let subject: { id: string; email: string; department: string | null } | null = null;
    if (input.forGuest) {
      if (!(await canBookForUser(ctx, null, floor.siteId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: `You don't have permission to book for guests at ${floor.site.name}.` });
      }
    } else {
      const occupantId = input.occupantUserId ?? viewerId;
      if (!(await canBookForUser(ctx, occupantId, floor.siteId))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view availability for yourself." });
      }
      subject = await ctx.db.user.findFirst({ where: { id: occupantId }, select: { id: true, email: true, department: true } });
      if (!subject) throw new TRPCError({ code: "NOT_FOUND", message: "That user wasn't found in your organization." });
    }
    const today = todayInTimeZone(floor.site.timeZone);
    // Admins managing this site see and may act on every booking; everyone else
    // only on their own, and sees coworker identities only if the site allows it (spec §8.4).
    const viewerManagesSite = await canManageSite(ctx, floor.siteId);

    const dayStart = zonedDateTimeToUtc(input.date, 0, floor.site.timeZone);
    const dayEnd = zonedDateTimeToUtc(input.date, 24 * 60, floor.site.timeZone);
    const bookings = await ctx.db.booking.findMany({
      where: { deskId: { in: floor.desks.map((desk) => desk.id) }, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
      include: {
        user: { select: { name: true, email: true, department: true, title: true } },
        bookedBy: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    });

    // The window the map is asking about. A desk is only BOOKED while a
    // booking actually overlaps it; with no window, the whole site-local day.
    const requestedRange =
      input.startMinutes !== undefined && input.endMinutes !== undefined
        ? {
            start: zonedDateTimeToUtc(input.date, input.startMinutes, floor.site.timeZone),
            end: zonedDateTimeToUtc(input.date, input.endMinutes, floor.site.timeZone),
          }
        : null;
    const window = requestedRange ?? { start: dayStart, end: dayEnd };

    const now = new Date();
    const desks = floor.desks.map((desk) => {
      const deskBookings = bookings.filter((booking) => booking.deskId === desk.id);
      const activeBookings = deskBookings.filter((booking) => ACTIVE_BOOKING_STATUSES.includes(booking.status));
      const eligibility = evaluateDeskEligibility({
        desk,
        occupant: subject,
        date: input.date,
        today,
        startMinutes: input.startMinutes,
        endMinutes: input.endMinutes,
      });
      return {
        deskId: desk.id,
        state: computeDeskState(desk, deskBookings, window),
        /** Whether the evaluated occupant (viewer by default, or occupantUserId / a guest) could book this desk on this date. */
        eligibleForViewer: eligibility.eligible,
        eligibilityReason: eligibility.reason,
        freeForRequestedSlot: requestedRange
          ? isDeskFreeForRange(deskBookings, requestedRange.start, requestedRange.end)
          : undefined,
        bookings: activeBookings.map((booking) => {
          const isOwn = booking.userId === viewerId || booking.bookedById === viewerId;
          const canSeeIdentity = isOwn || viewerManagesSite || floor.site.allowEmployeeSeeBookings;
          const occupantName = booking.user?.name ?? booking.guestName ?? "Guest";
          return {
            id: booking.id,
            status: booking.status,
            userId: booking.userId,
            bookedById: booking.bookedById,
            startAt: booking.startAt,
            endAt: booking.endAt,
            isOwn,
            /** Server-resolved: the viewer may cancel/end/check in to this booking (same rule the mutations enforce). */
            canManage: isOwn || viewerManagesSite,
            occupantLabel: canSeeIdentity ? occupantName : "Booked",
            /** Who holds the desk — hidden when the site keeps coworker bookings private. */
            occupant: canSeeIdentity
              ? {
                  name: occupantName,
                  email: booking.user?.email ?? null,
                  department: booking.user?.department ?? null,
                  title: booking.user?.title ?? null,
                  isGuest: booking.userId === null,
                }
              : null,
            /** Set when someone booked on the occupant's behalf. */
            bookedByLabel: canSeeIdentity && booking.bookedById !== booking.userId ? booking.bookedBy.name : null,
          };
        }),
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
