import { TRPCError } from "@trpc/server";

import type { CreateBookingInput } from "@/lib/schemas/booking";
import type { Session } from "@/server/auth/roles";
import { assertCanBookForUser } from "@/server/auth/authorization";
import type { ScopedDb } from "@/server/tenancy";
import { ACTIVE_BOOKING_STATUSES, isDeskFreeForRange } from "@/server/booking/desk-state";
import { eligibilityDeskInclude, evaluateDeskEligibility } from "@/server/booking/eligibility";
import { isWeekday, zonedDateTimeToUtc } from "@/server/booking/time";
import { todayInTimeZone } from "@/lib/time-slots";
import { Prisma } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/enums";

interface BookingSubject {
  userId: string | null;
  bookedById: string;
  guestName: string | null;
}

/** Extracts the underlying Postgres error message Prisma wraps for an unrecognized constraint violation. */
function extractDriverErrorMessage(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const meta = error.meta as { driverAdapterError?: { cause?: { message?: string } } } | undefined;
  return meta?.driverAdapterError?.cause?.message ?? error.message;
}

function conflictErrorFor(error: unknown): TRPCError | null {
  const message = extractDriverErrorMessage(error);
  if (!message) return null;
  if (message.includes("bookings_desk_no_overlap")) {
    return new TRPCError({ code: "CONFLICT", message: "This desk was just booked for an overlapping time — pick another slot or desk." });
  }
  if (message.includes("bookings_user_no_overlap")) {
    return new TRPCError({ code: "CONFLICT", message: "You already have a booking that overlaps this time." });
  }
  return null;
}

/**
 * Who the booking is for. Booking on behalf of another employee or a guest is
 * governed by `canBookForUser` (System Admin anywhere, Facility Admin at a
 * managed site, Booking Manager at a site they hold a BOOK_FOR_OTHERS
 * permission for) — never by the role alone.
 */
async function resolveBookingSubject(
  ctx: { db: ScopedDb; session: Session },
  input: CreateBookingInput,
  site: { id: string; name: string },
): Promise<BookingSubject> {
  const actorId = ctx.session.user.id;

  if (!input.forUserId && !input.guestName) {
    return { userId: actorId, bookedById: actorId, guestName: null };
  }

  if (input.guestName) {
    await assertCanBookForUser(ctx, null, site);
    return { userId: null, bookedById: actorId, guestName: input.guestName };
  }

  await assertCanBookForUser(ctx, input.forUserId!, site);
  const target = await ctx.db.user.findUnique({ where: { id: input.forUserId! } });
  if (!target || !target.isActive) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That user wasn't found in your organization." });
  }
  return { userId: target.id, bookedById: actorId, guestName: null };
}

export async function createBooking(
  ctx: { db: ScopedDb; session: Session; organizationId: string },
  input: CreateBookingInput,
) {
  const desk = await ctx.db.desk.findFirst({
    where: { id: input.deskId, archivedAt: null },
    include: { floor: { include: { site: true } }, ...eligibilityDeskInclude },
  });
  if (!desk) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found." });
  }
  if (!desk.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Desk ${desk.number} is inactive and can't be booked.` });
  }

  const site = desk.floor.site;

  if (!isWeekday(input.date)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Bookings can only be made for weekdays." });
  }
  if (input.startMinutes < site.operatingHoursStart || input.endMinutes > site.operatingHoursEnd) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Booking time is outside this site's operating hours." });
  }

  const startAt = zonedDateTimeToUtc(input.date, input.startMinutes, site.timeZone);
  const endAt = zonedDateTimeToUtc(input.date, input.endMinutes, site.timeZone);
  if (startAt.getTime() <= Date.now()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Can't book a time in the past." });
  }

  const subject = await resolveBookingSubject(ctx, input, site);

  // Friendly pre-check — the exclusion constraint below is the actual enforcement (CLAUDE.md rule 2/4).
  const dayStart = zonedDateTimeToUtc(input.date, 0, site.timeZone);
  const dayEnd = zonedDateTimeToUtc(input.date, 24 * 60, site.timeZone);
  const sameDayFilter = { status: { in: ACTIVE_BOOKING_STATUSES }, startAt: { lt: dayEnd }, endAt: { gt: dayStart } };

  const deskBookings = await ctx.db.booking.findMany({ where: { ...sameDayFilter, deskId: desk.id } });
  if (!isDeskFreeForRange(deskBookings, startAt, endAt)) {
    throw new TRPCError({ code: "CONFLICT", message: "This desk is already booked for an overlapping time." });
  }
  if (subject.userId) {
    const userBookings = await ctx.db.booking.findMany({ where: { ...sameDayFilter, userId: subject.userId } });
    if (!isDeskFreeForRange(userBookings, startAt, endAt)) {
      throw new TRPCError({ code: "CONFLICT", message: "That user already has a booking that overlaps this time." });
    }
  }

  // Restriction / shift / advance-window check — evaluated against the OCCUPANT
  // (never the admin booking on their behalf) by the shared eligibility engine.
  const occupant = subject.userId
    ? await ctx.db.user.findFirst({ where: { id: subject.userId }, select: { id: true, email: true, department: true, title: true } })
    : null;
  if (subject.userId && !occupant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Occupant user not found." });
  }

  const eligibility = evaluateDeskEligibility({
    desk,
    occupant,
    date: input.date,
    today: todayInTimeZone(site.timeZone),
  });
  if (!eligibility.eligible) {
    const isAccessDenial =
      eligibility.status === "RESTRICTION_MISMATCH" ||
      eligibility.status === "DEPARTMENT_MISMATCH" ||
      eligibility.status === "NOT_ASSIGNED_OCCUPANT";
    throw new TRPCError({ code: isAccessDenial ? "FORBIDDEN" : "BAD_REQUEST", message: eligibility.reason ?? "This desk can't be booked." });
  }

  try {
    return await ctx.db.booking.create({
      data: {
        organizationId: ctx.organizationId,
        deskId: desk.id,
        userId: subject.userId,
        guestName: subject.guestName,
        bookedById: subject.bookedById,
        date: new Date(`${input.date}T00:00:00Z`),
        startAt,
        endAt,
        status: BookingStatus.CONFIRMED,
      },
    });
  } catch (error) {
    throw conflictErrorFor(error) ?? error;
  }
}
