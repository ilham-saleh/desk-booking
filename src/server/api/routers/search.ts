import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { canManageSite } from "@/server/auth/authorization";
import { ACTIVE_BOOKING_STATUSES } from "@/server/booking/desk-state";

const RESULT_LIMIT = 8;

const bookingSummaryInclude = {
  desk: {
    select: {
      id: true,
      number: true,
      floor: {
        select: {
          id: true,
          name: true,
          siteId: true,
          site: {
            select: { id: true, name: true, timeZone: true, allowEmployeeSeeBookings: true },
          },
        },
      },
    },
  },
} as const;

/**
 * Global search for every signed-in employee (CLAUDE.md §34: server-side,
 * bounded result sets — never the whole directory). Desks match on number or
 * name across every site; people match on name or email in the org directory.
 */
export const searchRouter = createTRPCRouter({
  global: orgProcedure
    .input(z.object({ query: z.string().trim().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const query = input.query;
      const [desks, people] = await Promise.all([
        ctx.db.desk.findMany({
          where: {
            archivedAt: null,
            OR: [
              { number: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            number: true,
            name: true,
            isActive: true,
            floor: { select: { id: true, name: true, site: { select: { id: true, name: true } } } },
          },
          orderBy: [{ number: "asc" }],
          take: RESULT_LIMIT,
        }),
        ctx.db.user.findMany({
          where: {
            isActive: true,
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, email: true, department: true, title: true },
          orderBy: { name: "asc" },
          take: RESULT_LIMIT,
        }),
      ]);
      return { desks, people };
    }),

  /**
   * A colleague's directory card plus where they sit: the booking in progress
   * right now and the next upcoming one. Booking details respect each site's
   * coworker-visibility setting (spec §8.4) unless the viewer is that person
   * or an admin managing the site.
   */
  person: orgProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const person = await ctx.db.user.findFirst({
        where: { id: input.userId },
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          title: true,
          isActive: true,
        },
      });
      if (!person)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person wasn't found in your organization.",
        });

      const now = new Date();
      const bookings = await ctx.db.booking.findMany({
        where: { userId: person.id, status: { in: ACTIVE_BOOKING_STATUSES }, endAt: { gt: now } },
        orderBy: { startAt: "asc" },
        take: 2,
        include: bookingSummaryInclude,
      });

      const isSelf = person.id === ctx.session.user.id;
      let hiddenByPolicy = false;
      const visible = [];
      for (const booking of bookings) {
        const site = booking.desk.floor.site;
        const canSee =
          isSelf || site.allowEmployeeSeeBookings || (await canManageSite(ctx, site.id));
        if (!canSee) {
          hiddenByPolicy = true;
          continue;
        }
        visible.push({
          id: booking.id,
          status: booking.status,
          startAt: booking.startAt,
          endAt: booking.endAt,
          desk: { id: booking.desk.id, number: booking.desk.number },
          floor: { id: booking.desk.floor.id, name: booking.desk.floor.name },
          site: { id: site.id, name: site.name, timeZone: site.timeZone },
        });
      }

      return {
        person,
        currentBooking: visible.find((b) => b.startAt <= now) ?? null,
        nextBooking: visible.find((b) => b.startAt > now) ?? null,
        /** True when at least one booking was withheld because its site hides coworker bookings. */
        hiddenByPolicy,
      };
    }),
});
