/**
 * Reusable availability shifts — org-wide named weekday sets ("Mon + Fri",
 * "Wednesday Only") that desk restriction blocks reference. Kept as records
 * rather than hard-coded combinations so admins can add the ones they need.
 */

import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { shiftCreateInputSchema, shiftUpdateInputSchema } from "@/lib/schemas/restriction";
import { createTRPCRouter, orgProcedure, siteAdminProcedure } from "@/server/api/trpc";

export const shiftRouter = createTRPCRouter({
  /** Active shifts with how many desks use each — ordered so the dropdown reads naturally. */
  list: orgProcedure.query(async ({ ctx }) => {
    const shifts = await ctx.db.availabilityShift.findMany({
      where: { isActive: true },
      include: { _count: { select: { deskAssignments: true } } },
      orderBy: [{ name: "asc" }],
    });
    return shifts.map(({ _count, ...shift }) => ({ ...shift, assignmentCount: _count.deskAssignments }));
  }),

  create: siteAdminProcedure.input(shiftCreateInputSchema).mutation(async ({ ctx, input }) => {
    // Names are unique per org including soft-deleted rows: revive a deleted shift with the same name.
    const clash = await ctx.db.availabilityShift.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" } },
    });
    if (clash?.isActive) throw new TRPCError({ code: "CONFLICT", message: `A shift named "${input.name}" already exists.` });

    const data = {
      name: input.name,
      daysOfWeek: [...new Set(input.daysOfWeek)].sort((a, b) => a - b),
      startTimeMinutes: input.startTimeMinutes ?? null,
      endTimeMinutes: input.endTimeMinutes ?? null,
    };
    const shift = clash
      ? await ctx.db.availabilityShift.update({ where: { id: clash.id }, data: { ...data, isActive: true } })
      : await ctx.db.availabilityShift.create({ data: { organizationId: ctx.organizationId, ...data } });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "CREATE",
        targetType: "AvailabilityShift",
        targetId: shift.id,
        after: { name: shift.name, daysOfWeek: shift.daysOfWeek },
      },
    });

    return shift;
  }),

  /** Editing a shift changes every desk block that uses it — that's the point of a reusable record. */
  update: siteAdminProcedure.input(shiftUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const shift = await ctx.db.availabilityShift.findFirst({ where: { id: input.shiftId, isActive: true } });
    if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "Shift not found." });

    const clash = await ctx.db.availabilityShift.findFirst({
      where: { id: { not: shift.id }, name: { equals: input.name, mode: "insensitive" } },
    });
    if (clash?.isActive) throw new TRPCError({ code: "CONFLICT", message: `A shift named "${input.name}" already exists.` });
    // A soft-deleted shift holding this name has no desk blocks (delete requires none) — clear it so the rename can proceed.
    if (clash) await ctx.db.availabilityShift.delete({ where: { id: clash.id } });

    const updated = await ctx.db.availabilityShift.update({
      where: { id: shift.id },
      data: {
        name: input.name,
        daysOfWeek: [...new Set(input.daysOfWeek)].sort((a, b) => a - b),
        startTimeMinutes: input.startTimeMinutes ?? null,
        endTimeMinutes: input.endTimeMinutes ?? null,
      },
    });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "UPDATE",
        targetType: "AvailabilityShift",
        targetId: shift.id,
        before: { name: shift.name, daysOfWeek: shift.daysOfWeek },
        after: { name: updated.name, daysOfWeek: updated.daysOfWeek },
      },
    });

    return updated;
  }),

  /** Soft-delete; refused while any desk block still references the shift. */
  delete: siteAdminProcedure.input(z.object({ shiftId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const shift = await ctx.db.availabilityShift.findFirst({ where: { id: input.shiftId, isActive: true } });
    if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "Shift not found." });

    const inUse = await ctx.db.deskRestrictionAssignment.count({ where: { shiftId: shift.id } });
    if (inUse > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `"${shift.name}" is used by ${inUse} desk restriction${inUse === 1 ? "" : "s"}. Change those desks first.`,
      });
    }

    await ctx.db.availabilityShift.update({ where: { id: shift.id }, data: { isActive: false } });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "DELETE",
        targetType: "AvailabilityShift",
        targetId: shift.id,
        before: { name: shift.name },
      },
    });
  }),
});
