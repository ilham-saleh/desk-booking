/**
 * Desk management router — CRUD for desks, attributes, and availability shifts.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, orgProcedure, siteAdminProcedure, assertSiteAdmin as assertFacilityAdmin } from "@/server/api/trpc";

export const availabilityShiftCreateInputSchema = z.object({
  deskId: z.string().min(1),
  restrictionId: z.string().optional().nullable(),
  name: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  advanceBookingWindowDays: z.number().int().min(0).optional(),
  startTimeMinutes: z.number().int().min(0).max(1440).optional(),
  endTimeMinutes: z.number().int().min(0).max(1440).optional(),
});

export type AvailabilityShiftCreateInput = z.infer<typeof availabilityShiftCreateInputSchema>;

export const availabilityShiftUpdateInputSchema = availabilityShiftCreateInputSchema.extend({
  shiftId: z.string().min(1),
});

export type AvailabilityShiftUpdateInput = z.infer<typeof availabilityShiftUpdateInputSchema>;

export const deskRouter = createTRPCRouter({
  // ===== AVAILABILITY SHIFTS =====

  /**
   * List all availability shifts for a desk.
   */
  listAvailabilityShifts: orgProcedure
    .input(z.object({ deskId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const shifts = await ctx.db.availabilityShift.findMany({
        where: { deskId: input.deskId, isActive: true },
        include: { restriction: true },
        orderBy: { createdAt: "asc" },
      });
      return shifts;
    }),

  /**
   * Create an availability shift for a desk.
   * FACILITY_ADMIN or higher (for desk's parent facility).
   */
  createAvailabilityShift: siteAdminProcedure
    .input(availabilityShiftCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const desk = await ctx.db.desk.findUnique({
        where: { id: input.deskId },
        include: { floor: true },
      });
      if (!desk) throw new TRPCError({ code: "NOT_FOUND", message: "Desk not found" });

      // Verify admin has access to the desk's facility
      await assertFacilityAdmin(ctx, desk.floor.siteId);

      const shift = await ctx.db.availabilityShift.create({
        data: {
          organizationId: ctx.organizationId,
          deskId: input.deskId,
          restrictionId: input.restrictionId || null,
          name: input.name,
          daysOfWeek: input.daysOfWeek,
          advanceBookingWindowDays: input.advanceBookingWindowDays,
          startTimeMinutes: input.startTimeMinutes,
          endTimeMinutes: input.endTimeMinutes,
        },
        include: { restriction: true },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "CREATE",
          targetType: "AvailabilityShift",
          targetId: shift.id,
          after: {
            name: shift.name,
            daysOfWeek: shift.daysOfWeek,
            restrictionName: input.restrictionId ? "set" : "none",
          },
        },
      });

      return shift;
    }),

  /**
   * Update an availability shift.
   * FACILITY_ADMIN or higher.
   */
  updateAvailabilityShift: siteAdminProcedure
    .input(availabilityShiftUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const shift = await ctx.db.availabilityShift.findUnique({
        where: { id: input.shiftId },
        include: { desk: { include: { floor: true } } },
      });
      if (!shift) throw new TRPCError({ code: "NOT_FOUND" });

      await assertFacilityAdmin(ctx, shift.desk.floor.siteId);

      const updated = await ctx.db.availabilityShift.update({
        where: { id: input.shiftId },
        data: {
          restrictionId: input.restrictionId || null,
          name: input.name,
          daysOfWeek: input.daysOfWeek,
          advanceBookingWindowDays: input.advanceBookingWindowDays,
          startTimeMinutes: input.startTimeMinutes,
          endTimeMinutes: input.endTimeMinutes,
        },
        include: { restriction: true },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "UPDATE",
          targetType: "AvailabilityShift",
          targetId: shift.id,
          before: { name: shift.name },
          after: { name: updated.name },
        },
      });

      return updated;
    }),

  /**
   * Delete an availability shift (soft-delete via isActive = false).
   * FACILITY_ADMIN or higher.
   */
  deleteAvailabilityShift: siteAdminProcedure
    .input(z.object({ shiftId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const shift = await ctx.db.availabilityShift.findUnique({
        where: { id: input.shiftId },
        include: { desk: { include: { floor: true } } },
      });
      if (!shift) throw new TRPCError({ code: "NOT_FOUND" });

      await assertFacilityAdmin(ctx, shift.desk.floor.siteId);

      await ctx.db.availabilityShift.update({
        where: { id: input.shiftId },
        data: { isActive: false },
      });

      // Audit log
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

  /**
   * Get applicable availability shifts for a desk on a given day.
   * Used for booking eligibility checking.
   */
  getShiftsForDay: orgProcedure
    .input(
      z.object({
        deskId: z.string().min(1),
        dayOfWeek: z.number().int().min(0).max(6),
      }),
    )
    .query(async ({ ctx, input }) => {
      const shifts = await ctx.db.availabilityShift.findMany({
        where: {
          deskId: input.deskId,
          isActive: true,
          daysOfWeek: { has: input.dayOfWeek },
        },
        include: { restriction: { include: { rules: true } } },
      });
      return shifts;
    }),
});
