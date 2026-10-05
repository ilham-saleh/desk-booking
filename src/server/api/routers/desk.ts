/**
 * Desk management router — the Editing Platform's desk CRUD (create at a map
 * position, move, full edit-modal save, safe delete) plus the read-only
 * eligibility check the Floor Map uses to explain restrictions.
 */

import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { deskCreateInputSchema, deskMoveInputSchema, deskSaveInputSchema } from "@/lib/schemas/desk";
import { dateStringSchema } from "@/lib/schemas/booking";
import { findOverlappingDays, formatDays } from "@/lib/restrictions";
import { todayInTimeZone } from "@/lib/time-slots";
import { createTRPCRouter, orgProcedure, siteAdminProcedure, assertSiteAdmin } from "@/server/api/trpc";
import { canBookForUser } from "@/server/auth/authorization";
import { ACTIVE_BOOKING_STATUSES } from "@/server/booking/desk-state";
import { eligibilityDeskInclude, evaluateDeskEligibility } from "@/server/booking/eligibility";
import type { ScopedDb } from "@/server/tenancy";
import { Prisma } from "@/generated/prisma/client";

export { deskCreateInputSchema, deskMoveInputSchema, deskSaveInputSchema };

/** Full desk payload for the edit modal and the Floor Map panel. */
const deskDetailInclude = {
  ...eligibilityDeskInclude,
  attributes: { orderBy: { type: "asc" as const } },
  assignedOccupant: { select: { id: true, name: true, email: true } },
  floor: { select: { id: true, name: true, site: { select: { id: true, name: true, timeZone: true } } } },
} as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** "Desk 12" — the lowest unused auto-name on the floor, so placement never asks for a name first. */
async function nextAutoDeskNumber(db: ScopedDb, floorId: string): Promise<string> {
  const existing = new Set((await db.desk.findMany({ where: { floorId }, select: { number: true } })).map((d) => d.number));
  for (let n = existing.size + 1; ; n++) {
    const candidate = `Desk ${n}`;
    if (!existing.has(candidate)) return candidate;
  }
}

export const deskRouter = createTRPCRouter({
  // ===== QUERIES =====

  /** One desk with attributes, restriction blocks (shift, restriction rules, occupants, departments) and location. */
  get: orgProcedure.input(z.object({ deskId: z.string().min(1) })).query(async ({ ctx, input }) => {
    const desk = await ctx.db.desk.findFirst({
      where: { id: input.deskId, archivedAt: null },
      include: deskDetailInclude,
    });
    if (!desk) throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found." });
    return desk;
  }),

  /** Every live (non-archived) desk on a floor with its restriction blocks — the editor's marker layer. */
  listForFloor: orgProcedure.input(z.object({ floorId: z.string().min(1) })).query(({ ctx, input }) =>
    ctx.db.desk.findMany({
      where: { floorId: input.floorId, archivedAt: null },
      include: {
        attributes: true,
        restrictionAssignments: {
          orderBy: { sortOrder: "asc" },
          include: {
            shift: true,
            restriction: { select: { id: true, name: true, color: true, isActive: true } },
            occupants: { select: { userId: true, user: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { number: "asc" },
    }),
  ),

  /**
   * Read-only eligibility explanation for one desk on one date — the same
   * engine booking.create enforces, so the Floor Map can say *why* before the
   * user tries. Standard users may only ask about themselves.
   */
  checkEligibility: orgProcedure
    .input(
      z
        .object({
          deskId: z.string().min(1),
          date: dateStringSchema,
          occupantUserId: z.string().min(1).optional(),
          /** Evaluate for a guest (no employee record) — admin/booking-manager only, like guest bookings themselves. */
          forGuest: z.boolean().optional(),
        })
        .refine((input) => !(input.forGuest && input.occupantUserId), { message: "Choose a user or a guest, not both" }),
    )
    .query(async ({ ctx, input }) => {
      const desk = await ctx.db.desk.findFirst({
        where: { id: input.deskId, archivedAt: null },
        include: { ...eligibilityDeskInclude, floor: { select: { site: { select: { id: true, name: true, timeZone: true } } } } },
      });
      if (!desk) throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found." });

      // Same rule as booking.create: only someone allowed to book for this
      // occupant (or a guest) at this site may ask about their eligibility.
      let occupant: { id: string; email: string; department: string | null } | null = null;
      if (input.forGuest) {
        if (!(await canBookForUser(ctx, null, desk.floor.site.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: `You don't have permission to book for guests at ${desk.floor.site.name}.` });
        }
      } else {
        const occupantId = input.occupantUserId ?? ctx.session.user.id;
        if (!(await canBookForUser(ctx, occupantId, desk.floor.site.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can only check eligibility for yourself." });
        }
        occupant = await ctx.db.user.findFirst({
          where: { id: occupantId },
          select: { id: true, email: true, department: true },
        });
        if (!occupant) throw new TRPCError({ code: "NOT_FOUND", message: "That user wasn't found in your organization." });
      }

      const result = evaluateDeskEligibility({
        desk,
        occupant,
        date: input.date,
        today: todayInTimeZone(desk.floor.site.timeZone),
      });
      return {
        eligible: result.eligible,
        status: result.status,
        reason: result.reason,
        dayOfWeek: result.dayOfWeek,
        assignmentId: result.assignment?.id ?? null,
      };
    }),

  // ===== MUTATIONS (Facility Admin for the desk's site, or Org Super Admin) =====

  /**
   * Create a desk at a floor-plan position (image-pixel coordinates). The
   * name is optional so the placement cursor can create first and let the
   * edit modal name it.
   */
  createDesk: siteAdminProcedure.input(deskCreateInputSchema).mutation(async ({ ctx, input }) => {
    const floor = await ctx.db.floor.findUnique({ where: { id: input.floorId }, select: { id: true, siteId: true, name: true } });
    if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found." });
    await assertSiteAdmin(ctx, floor.siteId);

    const number = input.number ?? (await nextAutoDeskNumber(ctx.db, floor.id));

    let desk;
    try {
      desk = await ctx.db.desk.create({
        data: { organizationId: ctx.organizationId, floorId: floor.id, number, x: input.x, y: input.y },
        include: deskDetailInclude,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: `A desk named "${number}" already exists on ${floor.name}.` });
      }
      throw error;
    }

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "CREATE",
        targetType: "Desk",
        targetId: desk.id,
        after: { number: desk.number, floor: floor.name, x: desk.x, y: desk.y },
      },
    });

    return desk;
  }),

  /** Persist a drag-and-drop reposition. Coordinates are floor-plan image pixels, not viewport pixels. */
  moveDesk: siteAdminProcedure.input(deskMoveInputSchema).mutation(async ({ ctx, input }) => {
    const desk = await ctx.db.desk.findFirst({
      where: { id: input.deskId, archivedAt: null },
      include: { floor: { select: { siteId: true } } },
    });
    if (!desk) throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found." });
    await assertSiteAdmin(ctx, desk.floor.siteId);

    const updated = await ctx.db.desk.update({
      where: { id: desk.id },
      data: { x: input.x, y: input.y },
      select: { id: true, x: true, y: true, number: true },
    });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "MOVE",
        targetType: "Desk",
        targetId: desk.id,
        before: { x: desk.x, y: desk.y },
        after: { x: updated.x, y: updated.y },
      },
    });

    return updated;
  }),

  /**
   * The Edit Desk modal's Save: details, status, booking configuration,
   * attributes and the full list of restriction blocks — written in one
   * transaction so a refresh can never show a half-saved desk.
   */
  save: siteAdminProcedure.input(deskSaveInputSchema).mutation(async ({ ctx, input }) => {
    const desk = await ctx.db.desk.findFirst({
      where: { id: input.deskId, archivedAt: null },
      include: { floor: { select: { id: true, siteId: true, name: true } }, restrictionAssignments: true, attributes: true },
    });
    if (!desk) throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found." });
    await assertSiteAdmin(ctx, desk.floor.siteId);

    // --- Validation: everything referenced must exist in this org and be active ---
    const duplicate = await ctx.db.desk.findFirst({
      where: { floorId: desk.floorId, number: input.number, id: { not: desk.id } },
      select: { id: true },
    });
    if (duplicate) {
      throw new TRPCError({ code: "CONFLICT", message: `A desk named "${input.number}" already exists on ${desk.floor.name}.` });
    }

    if (input.assignedOccupantId) {
      const occupant = await ctx.db.user.findFirst({ where: { id: input.assignedOccupantId, isActive: true } });
      if (!occupant) throw new TRPCError({ code: "BAD_REQUEST", message: "That occupant wasn't found in your organization." });
    }

    const shiftIds = [...new Set(input.assignments.map((a) => a.shiftId))];
    const shifts = await ctx.db.availabilityShift.findMany({ where: { id: { in: shiftIds }, isActive: true } });
    if (shifts.length !== shiftIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "One of the selected availability shifts no longer exists." });
    }
    const shiftById = new Map(shifts.map((s) => [s.id, s]));

    const restrictionIds = [
      ...new Set(input.assignments.filter((a) => a.restrictionMode === "CUSTOM").map((a) => a.restrictionId!)),
    ];
    if (restrictionIds.length > 0) {
      const restrictions = await ctx.db.bookingRestriction.findMany({ where: { id: { in: restrictionIds }, isActive: true } });
      if (restrictions.length !== restrictionIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "One of the selected custom restrictions no longer exists." });
      }
    }

    // Exactly one block may govern a weekday, otherwise booking rules would be ambiguous (CLAUDE.md §20).
    const overlapping = findOverlappingDays(input.assignments.map((a) => ({ daysOfWeek: shiftById.get(a.shiftId)!.daysOfWeek })));
    if (overlapping.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${formatDays(overlapping)} ${overlapping.length === 1 ? "is" : "are"} covered by more than one restriction block. Each day can only have one.`,
      });
    }

    // Block occupants must be real, active employees of this organization.
    const blockOccupantIds = [
      ...new Set(input.assignments.filter((a) => a.restrictionMode === "ASSIGNED_OCCUPANTS").flatMap((a) => a.occupantUserIds)),
    ];
    if (blockOccupantIds.length > 0) {
      const found = await ctx.db.user.count({ where: { id: { in: blockOccupantIds }, isActive: true } });
      if (found !== blockOccupantIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "One of the selected occupants wasn't found in your organization." });
      }
    }

    // --- Write ---
    const attributeKeys = [...new Set(input.attributes.map((a) => a.toUpperCase()))];
    const removedAttributes = desk.attributes.filter((a) => !attributeKeys.includes(a.type)).map((a) => a.id);
    const newAttributes = attributeKeys.filter((key) => !desk.attributes.some((a) => a.type === key));

    const saved = await ctx.db.$transaction(async (tx) => {
      await tx.desk.update({
        where: { id: desk.id },
        data: {
          number: input.number,
          description: input.description?.length ? input.description : null,
          spaceType: input.spaceType?.length ? input.spaceType : null,
          isActive: input.isActive,
          requiresCheckIn: input.requiresCheckIn,
          assignmentMode: input.assignmentMode,
          assignedOccupantId: input.assignedOccupantId ?? null,
        },
      });

      if (removedAttributes.length > 0) await tx.deskAttribute.deleteMany({ where: { id: { in: removedAttributes } } });
      if (newAttributes.length > 0) {
        await tx.deskAttribute.createMany({
          data: newAttributes.map((type) => ({ organizationId: ctx.organizationId, deskId: desk.id, type })),
        });
      }

      await tx.deskRestrictionAssignment.deleteMany({ where: { deskId: desk.id } });
      for (const [index, block] of input.assignments.entries()) {
        await tx.deskRestrictionAssignment.create({
          data: {
            organizationId: ctx.organizationId,
            deskId: desk.id,
            restrictionMode: block.restrictionMode,
            restrictionId: block.restrictionMode === "CUSTOM" ? block.restrictionId! : null,
            departmentNames: block.restrictionMode === "DEPARTMENT" ? [...new Set(block.departmentNames.map((n) => n.trim()))] : [],
            shiftId: block.shiftId,
            advanceBookingWindowDays: block.advanceBookingWindowDays ?? null,
            sortOrder: index,
            occupants:
              block.restrictionMode === "ASSIGNED_OCCUPANTS"
                ? { create: [...new Set(block.occupantUserIds)].map((userId) => ({ organizationId: ctx.organizationId, userId })) }
                : undefined,
          },
        });
      }

      return tx.desk.findUniqueOrThrow({ where: { id: desk.id }, include: deskDetailInclude });
    });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "UPDATE",
        targetType: "Desk",
        targetId: desk.id,
        before: { number: desk.number, isActive: desk.isActive, assignments: desk.restrictionAssignments.length },
        after: {
          number: saved.number,
          isActive: saved.isActive,
          assignments: saved.restrictionAssignments.map((a) => ({
            mode: a.restrictionMode,
            restriction: a.restriction?.name ?? null,
            departments: a.departmentNames,
            occupants: a.occupants.length,
            shift: a.shift.name,
            advanceBookingWindowDays: a.advanceBookingWindowDays,
          })),
        },
      },
    });

    return saved;
  }),

  /**
   * Remove a desk from its floor safely:
   *  - future active bookings → refused with a count (admin must cancel them first)
   *  - past booking history → archived (hidden from every map, history kept)
   *  - no bookings at all → hard-deleted
   */
  deleteDesk: siteAdminProcedure.input(z.object({ deskId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const desk = await ctx.db.desk.findFirst({
      where: { id: input.deskId, archivedAt: null },
      include: { floor: { select: { siteId: true, name: true } } },
    });
    if (!desk) throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found." });
    await assertSiteAdmin(ctx, desk.floor.siteId);

    const now = new Date();
    const futureBookings = await ctx.db.booking.count({
      where: { deskId: desk.id, status: { in: ACTIVE_BOOKING_STATUSES }, endAt: { gt: now } },
    });
    if (futureBookings > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Desk ${desk.number} has ${futureBookings} upcoming booking${futureBookings === 1 ? "" : "s"}. Cancel or move ${futureBookings === 1 ? "it" : "them"} before deleting the desk, or mark the desk inactive instead.`,
      });
    }

    const historicalBookings = await ctx.db.booking.count({ where: { deskId: desk.id } });
    const mode: "deleted" | "archived" = historicalBookings > 0 ? "archived" : "deleted";

    // Archived desks keep their bookings but must not block the name for a new desk on the floor.
    const archivedNumber = `${desk.number} [archived ${desk.id.slice(-6)}]`;

    await ctx.db.$transaction(async (tx) => {
      if (mode === "archived") {
        await tx.deskRestrictionAssignment.deleteMany({ where: { deskId: desk.id } });
        await tx.deskWatch.deleteMany({ where: { deskId: desk.id } });
        await tx.desk.update({ where: { id: desk.id }, data: { isActive: false, archivedAt: now, number: archivedNumber } });
      } else {
        await tx.deskWatch.deleteMany({ where: { deskId: desk.id } });
        await tx.desk.delete({ where: { id: desk.id } });
      }
    });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: mode === "archived" ? "ARCHIVE" : "DELETE",
        targetType: "Desk",
        targetId: desk.id,
        before: { number: desk.number, floor: desk.floor.name, historicalBookings },
        after: mode === "archived" ? { number: archivedNumber, archivedAt: now } : undefined,
      },
    });

    return { mode, deskId: desk.id, number: desk.number };
  }),
});
