import "server-only";

import { z } from "zod";

import { createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { formatNotification } from "@/server/notifications/format";
import { NOTIFICATION_TYPES } from "@/server/notifications/types";

/** The bell shows this many of the newest notifications. */
const LIST_LIMIT = 30;

/** In-app notifications for the signed-in user only — no procedure takes a user ID. */
export const notificationRouter = createTRPCRouter({
  unreadCount: orgProcedure.query(({ ctx }) => ctx.db.notification.count({ where: { userId: ctx.session.user.id, readAt: null } })),

  list: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.notification.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    });

    // Auto-cancel notifications written before payloads carried a time zone: look it up from the booking.
    const legacyBookingIds = rows
      .filter((r) => r.type === NOTIFICATION_TYPES.autoCancelled && !(r.payload as { timeZone?: string } | null)?.timeZone)
      .map((r) => (r.payload as { bookingId?: string } | null)?.bookingId)
      .filter((id): id is string => !!id);
    const legacyZones = new Map<string, string>();
    if (legacyBookingIds.length > 0) {
      const bookings = await ctx.db.booking.findMany({
        where: { id: { in: legacyBookingIds } },
        select: { id: true, desk: { select: { floor: { select: { site: { select: { timeZone: true } } } } } } },
      });
      for (const b of bookings) legacyZones.set(b.id, b.desk.floor.site.timeZone);
    }

    return rows.map((row) => {
      const bookingId = (row.payload as { bookingId?: string } | null)?.bookingId;
      return {
        id: row.id,
        type: row.type,
        readAt: row.readAt,
        createdAt: row.createdAt,
        ...formatNotification(row.type, row.payload, bookingId ? legacyZones.get(bookingId) : undefined),
      };
    });
  }),

  markRead: orgProcedure.input(z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })).mutation(async ({ ctx, input }) => {
    const { count } = await ctx.db.notification.updateMany({
      where: { id: { in: input.ids }, userId: ctx.session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }),

  markAllRead: orgProcedure.mutation(async ({ ctx }) => {
    const { count } = await ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }),
});
