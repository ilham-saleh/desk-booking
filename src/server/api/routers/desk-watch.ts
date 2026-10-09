import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { dateStringSchema } from "@/lib/schemas/booking";
import { formatDisplayDate, shiftIsoDate } from "@/lib/dates";
import { todayInTimeZone } from "@/lib/time-slots";
import { createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { ACTIVE_BOOKING_STATUSES } from "@/server/booking/desk-state";
import { eligibilityDeskInclude, evaluateDeskEligibility } from "@/server/booking/eligibility";
import { MAX_ACTIVE_DESK_WATCHES } from "@/server/notifications/desk-watch";

const watchInput = z.object({ deskId: z.string().min(1), date: dateStringSchema });

const asDbDate = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * "Notify me if this desk frees up" — one watch per person, desk and site-local
 * date. Watches are personal: every query is limited to the signed-in user.
 * Alerts are sent by notifyDeskWatchers when a booking that day is released.
 */
export const deskWatchRouter = createTRPCRouter({
  /** Whether the viewer is watching this desk on this date (Floor Map panel). */
  status: orgProcedure.input(watchInput).query(async ({ ctx, input }) => {
    const watch = await ctx.db.deskWatch.findFirst({
      where: { userId: ctx.session.user.id, deskId: input.deskId, date: asDbDate(input.date) },
      select: { id: true, notifiedAt: true },
    });
    return { watching: !!watch && watch.notifiedAt === null, notifiedAt: watch?.notifiedAt ?? null };
  }),

  /** The viewer's watches that haven't fired yet and aren't in the past (My Bookings). */
  listMine: orgProcedure.query(async ({ ctx }) => {
    // A day of slack either side of UTC; each row is then checked against its own site's "today".
    const earliest = asDbDate(shiftIsoDate(new Date().toISOString().slice(0, 10), -1));
    const watches = await ctx.db.deskWatch.findMany({
      where: { userId: ctx.session.user.id, notifiedAt: null, date: { gte: earliest } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        desk: { select: { id: true, number: true, floor: { select: { id: true, name: true, site: { select: { id: true, name: true, timeZone: true } } } } } },
      },
    });
    return watches
      .map((w) => ({ ...w, date: w.date.toISOString().slice(0, 10) }))
      .filter((w) => w.date >= todayInTimeZone(w.desk.floor.site.timeZone));
  }),

  create: orgProcedure.input(watchInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const desk = await ctx.db.desk.findFirst({
      where: { id: input.deskId, archivedAt: null },
      include: { ...eligibilityDeskInclude, floor: { include: { site: true } } },
    });
    if (!desk) throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found." });

    const today = todayInTimeZone(desk.floor.site.timeZone);
    if (input.date < today) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can't watch a desk for a date that has passed." });
    }

    // Only worth watching if the viewer could book it once it frees up.
    const viewer = await ctx.db.user.findFirst({ where: { id: userId }, select: { id: true, email: true, department: true, title: true } });
    if (!viewer) throw new TRPCError({ code: "NOT_FOUND", message: "Your account wasn't found in this organization." });
    const eligibility = evaluateDeskEligibility({ desk, occupant: viewer, date: input.date, today });
    if (!eligibility.eligible) throw new TRPCError({ code: "BAD_REQUEST", message: eligibility.reason ?? "You can't book this desk on that date." });

    const bookings = await ctx.db.booking.findMany({
      where: { deskId: desk.id, date: asDbDate(input.date), status: { in: ACTIVE_BOOKING_STATUSES } },
      select: { userId: true, bookedById: true },
    });
    if (bookings.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Desk ${desk.number} is free on ${formatDisplayDate(input.date)} — you can book it now.` });
    }
    if (bookings.some((b) => b.userId === userId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `You already have Desk ${desk.number} booked on ${formatDisplayDate(input.date)}.` });
    }

    const existing = await ctx.db.deskWatch.findFirst({ where: { userId, deskId: desk.id, date: asDbDate(input.date) } });
    if (existing && existing.notifiedAt === null) return { id: existing.id };

    const active = await ctx.db.deskWatch.count({ where: { userId, notifiedAt: null, date: { gte: asDbDate(today) } } });
    if (active >= MAX_ACTIVE_DESK_WATCHES) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `You're already watching ${MAX_ACTIVE_DESK_WATCHES} desks. Stop watching one in My Bookings to add another.`,
      });
    }

    // Re-arm a watch that already fired, or create a new one (unique per user, desk and date).
    const watch = await ctx.db.deskWatch.upsert({
      where: { userId_deskId_date: { userId, deskId: desk.id, date: asDbDate(input.date) } },
      create: { organizationId: ctx.organizationId, userId, deskId: desk.id, date: asDbDate(input.date) },
      update: { notifiedAt: null, createdAt: new Date() },
      select: { id: true },
    });
    return watch;
  }),

  remove: orgProcedure.input(watchInput).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.db.deskWatch.deleteMany({
      where: { userId: ctx.session.user.id, deskId: input.deskId, date: asDbDate(input.date) },
    });
    return { removed: count };
  }),
});
