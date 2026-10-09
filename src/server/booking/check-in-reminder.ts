import type { PrismaClient } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/enums";
import { CHECK_IN_DEADLINE_MINUTES, checkInDeadline } from "@/server/booking/auto-cancel";
import { NOTIFICATION_TYPES, type CheckInReminderPayload } from "@/server/notifications/types";

/** How long before the check-in deadline the reminder goes out. */
export const CHECK_IN_REMINDER_LEAD_MINUTES = 30;

/**
 * Reminds the occupant of a booking on a check-in-required desk that hasn't
 * been checked in yet, CHECK_IN_REMINDER_LEAD_MINUTES before the deadline at
 * which runCheckInAutoCancelSweep would release it (checkInDeadline: normally
 * an hour after the start, so the reminder lands 30 minutes into the booking).
 * Only while the booking is still running. Guest bookings remind the person
 * who made them.
 *
 * Sent once: the row is claimed by setting checkInReminderSentAt with a
 * conditional update before the notification is written, so overlapping
 * sweeps can't double-send. Run on a pg-boss schedule from jobs/worker.ts.
 */
export async function runCheckInReminderSweep(db: PrismaClient, now: Date = new Date()): Promise<number> {
  // With base = max(startAt, createdAt) and deadline = base + CHECK_IN_DEADLINE_MINUTES:
  // remind once deadline − lead ≤ now (base ≤ remindCutoff), while deadline > now (base > deadlineCutoff).
  const remindCutoff = new Date(now.getTime() - (CHECK_IN_DEADLINE_MINUTES - CHECK_IN_REMINDER_LEAD_MINUTES) * 60_000);
  const deadlineCutoff = new Date(now.getTime() - CHECK_IN_DEADLINE_MINUTES * 60_000);

  const candidates = await db.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      checkedInAt: null,
      checkInReminderSentAt: null,
      startAt: { lte: remindCutoff },
      createdAt: { lte: remindCutoff },
      OR: [{ startAt: { gt: deadlineCutoff } }, { createdAt: { gt: deadlineCutoff } }],
      endAt: { gt: now },
      desk: { requiresCheckIn: true },
    },
    select: {
      id: true,
      organizationId: true,
      userId: true,
      bookedById: true,
      guestName: true,
      deskId: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      desk: { select: { number: true, floor: { select: { id: true, name: true, site: { select: { id: true, name: true, timeZone: true } } } } } },
    },
  });

  let sent = 0;
  for (const booking of candidates) {
    const { count } = await db.booking.updateMany({
      where: { id: booking.id, status: BookingStatus.CONFIRMED, checkedInAt: null, checkInReminderSentAt: null },
      data: { checkInReminderSentAt: now },
    });
    if (count !== 1) continue;

    const payload: CheckInReminderPayload = {
      bookingId: booking.id,
      deskId: booking.deskId,
      deskNumber: booking.desk.number,
      floorId: booking.desk.floor.id,
      floorName: booking.desk.floor.name,
      siteId: booking.desk.floor.site.id,
      siteName: booking.desk.floor.site.name,
      timeZone: booking.desk.floor.site.timeZone,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      deadlineAt: checkInDeadline(booking).toISOString(),
      guestName: booking.userId ? null : booking.guestName,
    };
    await db.notification.create({
      data: {
        organizationId: booking.organizationId,
        userId: booking.userId ?? booking.bookedById,
        type: NOTIFICATION_TYPES.checkInReminder,
        payload: { ...payload },
      },
    });
    sent++;
  }
  return sent;
}
