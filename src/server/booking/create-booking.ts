import { TRPCError } from "@trpc/server";

import type { CreateBookingInput } from "@/lib/schemas/booking";
import { isSiteAdminRole, type Session } from "@/server/auth/roles";
import { assertSiteAdmin } from "@/server/api/trpc";
import type { ScopedDb } from "@/server/tenancy";
import { ACTIVE_BOOKING_STATUSES, isDeskFreeForRange } from "@/server/booking/desk-state";
import { isWeekday, zonedDateTimeToUtc } from "@/server/booking/time";
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

async function resolveBookingSubject(
  ctx: { db: ScopedDb; session: Session },
  input: CreateBookingInput,
  siteId: string,
): Promise<BookingSubject> {
  const actorId = ctx.session.user.id;

  if (!input.forUserId && !input.guestName) {
    return { userId: actorId, bookedById: actorId, guestName: null };
  }

  if (!isSiteAdminRole(ctx.session)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can book on behalf of another user or a guest." });
  }
  await assertSiteAdmin(ctx, siteId);

  if (input.guestName) {
    return { userId: null, bookedById: actorId, guestName: input.guestName };
  }

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
  const desk = await ctx.db.desk.findUnique({
    where: { id: input.deskId },
    include: { floor: { include: { site: true } } },
  });
  if (!desk) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found." });
  }
  if (!desk.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This desk isn't bookable." });
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

  const subject = await resolveBookingSubject(ctx, input, site.id);

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

  // Validate occupant against desk restrictions for this day
  if (subject.userId) {
    const dayOfWeek = new Date(`${input.date}T00:00:00Z`).getUTCDay();

    // Get applicable availability shifts for this day
    const shifts = await ctx.db.availabilityShift.findMany({
      where: {
        deskId: desk.id,
        isActive: true,
        daysOfWeek: { has: dayOfWeek },
      },
      include: { restriction: { include: { rules: true } } },
    });

    // If no shifts defined, desk is not bookable on this day
    if (shifts.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This desk is not available for booking on this day.",
      });
    }

    // Check if occupant matches at least one shift's restriction
    const occupant = await ctx.db.user.findUnique({ where: { id: subject.userId } });
    if (!occupant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Occupant user not found." });
    }

    let matchesAnyShift = false;
    let mismatchReason = "";

    for (const shift of shifts) {
      // Check advance booking window for this shift
      if (shift.advanceBookingWindowDays) {
        const now = new Date();
        const dayMillis = shift.advanceBookingWindowDays * 24 * 60 * 60 * 1000;
        const maxBookingDate = new Date(now.getTime() + dayMillis);
        if (startAt > maxBookingDate) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Bookings for this desk must be within ${shift.advanceBookingWindowDays} days in advance.`,
          });
        }
      }

      // Check restriction (if no restriction, anyone can book)
      if (!shift.restriction || shift.restriction.rules.length === 0) {
        matchesAnyShift = true;
        break;
      }

      // Check if occupant matches this restriction
      let shiftMatches = false;
      for (const rule of shift.restriction.rules) {
        const ruleValues = Array.isArray(rule.value) ? rule.value : [rule.value];
        let ruleMatches = false;

        switch (rule.fieldType) {
          case "DEPARTMENT":
            ruleMatches = ruleValues.includes(occupant.department || "");
            break;
          case "EMAIL":
            ruleMatches = ruleValues.includes(occupant.email);
            break;
          case "USER":
            ruleMatches = ruleValues.includes(occupant.id);
            break;
        }

        // Apply operator
        if (rule.operator.startsWith("IS_NOT")) {
          ruleMatches = !ruleMatches;
        }

        // Currently OR logic within a shift
        if (ruleMatches) {
          shiftMatches = true;
          break;
        }
      }

      if (shiftMatches) {
        matchesAnyShift = true;
        break;
      }

      // Store reason for first non-matching shift
      if (!mismatchReason) {
        mismatchReason = `Restricted to ${shift.restriction.name} on this day.`;
      }
    }

    if (!matchesAnyShift) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Not eligible to book this desk. ${mismatchReason}`,
      });
    }
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
