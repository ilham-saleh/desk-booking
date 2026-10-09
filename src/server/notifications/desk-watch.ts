import type { PrismaClient } from "@/generated/prisma/client";
import { NOTIFICATION_TYPES, type DeskWatchAvailablePayload } from "@/server/notifications/types";
import type { ScopedDb } from "@/server/tenancy";

/** Most watches one person can have waiting at once. */
export const MAX_ACTIVE_DESK_WATCHES = 20;

export interface FreedBooking {
  id: string;
  organizationId: string;
  deskId: string;
  /** Booking.date — the site-local calendar date (stored at UTC midnight). */
  date: Date;
  startAt: Date;
  endAt: Date;
  userId: string | null;
  bookedById: string;
}

/**
 * A booking stopped holding its desk (cancelled, auto-cancelled or ended
 * early): alert everyone watching that desk for that date, once. Each watch is
 * claimed with a conditional update before its notification is written, so
 * concurrent releases on the same day can't double-notify.
 *
 * Never throws: a failed alert must not undo the cancellation that caused it.
 * Takes the raw client (worker) or the org-scoped one (API); every query names
 * the booking's own organization either way.
 */
export async function notifyDeskWatchers(
  db: PrismaClient | ScopedDb,
  booking: FreedBooking,
  /** releasedEarly: the booking was ended mid-way, so the desk is free from now rather than from its start. */
  options: { releasedEarly: boolean; actorId: string | null },
): Promise<number> {
  try {
    const freedStart = options.releasedEarly ? new Date() : booking.startAt;
    // Nothing left to offer, e.g. a short booking auto-cancelled after it had already ended.
    if (freedStart >= booking.endAt) return 0;

    const client = db as unknown as PrismaClient;
    const excluded = [booking.userId, booking.bookedById, options.actorId].filter((id): id is string => !!id);
    const watches = await client.deskWatch.findMany({
      where: {
        organizationId: booking.organizationId,
        deskId: booking.deskId,
        date: booking.date,
        notifiedAt: null,
        userId: { notIn: excluded },
        user: { isActive: true },
      },
      select: { id: true, userId: true },
    });
    if (watches.length === 0) return 0;

    const desk = await client.desk.findFirst({
      where: { id: booking.deskId, organizationId: booking.organizationId },
      select: { id: true, number: true, floor: { select: { id: true, name: true, site: { select: { id: true, name: true, timeZone: true } } } } },
    });
    if (!desk) return 0;

    const payload: DeskWatchAvailablePayload = {
      deskId: desk.id,
      deskNumber: desk.number,
      floorId: desk.floor.id,
      floorName: desk.floor.name,
      siteId: desk.floor.site.id,
      siteName: desk.floor.site.name,
      timeZone: desk.floor.site.timeZone,
      date: booking.date.toISOString().slice(0, 10),
      freedStartAt: freedStart.toISOString(),
      freedEndAt: booking.endAt.toISOString(),
      slotAligned: !options.releasedEarly,
    };

    let sent = 0;
    for (const watch of watches) {
      const { count } = await client.deskWatch.updateMany({
        where: { id: watch.id, organizationId: booking.organizationId, notifiedAt: null },
        data: { notifiedAt: new Date() },
      });
      if (count !== 1) continue;
      await client.notification.create({
        data: {
          organizationId: booking.organizationId,
          userId: watch.userId,
          type: NOTIFICATION_TYPES.deskWatchAvailable,
          payload: { ...payload },
        },
      });
      sent++;
    }
    return sent;
  } catch (error) {
    console.error("desk-watch: failed to notify watchers", { bookingId: booking.id, error });
    return 0;
  }
}
