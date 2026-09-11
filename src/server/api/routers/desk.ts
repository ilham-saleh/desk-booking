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

export const deskCreateInputSchema = z.object({
  floorId: z.string().min(1),
  number: z.string().min(1),
  name: z.string().optional(),
  x: z.number().min(0),
  y: z.number().min(0),
  spaceType: z.string().optional(),
});

export type DeskCreateInput = z.infer<typeof deskCreateInputSchema>;

export const deskUpdateInputSchema = deskCreateInputSchema.extend({
  deskId: z.string().min(1),
});

export type DeskUpdateInput = z.infer<typeof deskUpdateInputSchema>;

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

  // ===== DESK CRUD =====

  /**
   * Create a desk on a floor.
   * FACILITY_ADMIN or higher.
   */
  createDesk: siteAdminProcedure.input(deskCreateInputSchema).mutation(async ({ ctx, input }) => {
    const floor = await ctx.db.floor.findUnique({
      where: { id: input.floorId },
      include: { site: true },
    });
    if (!floor) throw new TRPCError({ code: "NOT_FOUND", message: "Floor not found" });

    await assertFacilityAdmin(ctx, floor.siteId);

    const desk = await ctx.db.desk.create({
      data: {
        organizationId: ctx.organizationId,
        floorId: input.floorId,
        number: input.number,
        name: input.name,
        x: input.x,
        y: input.y,
        spaceType: input.spaceType,
      },
    });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "CREATE",
        targetType: "Desk",
        targetId: desk.id,
        after: { number: desk.number, floor: floor.name },
      },
    });

    return desk;
  }),

  /**
   * Update a desk.
   * FACILITY_ADMIN or higher.
   */
  updateDesk: siteAdminProcedure.input(deskUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const desk = await ctx.db.desk.findUnique({
      where: { id: input.deskId },
      include: { floor: true },
    });
    if (!desk) throw new TRPCError({ code: "NOT_FOUND" });

    await assertFacilityAdmin(ctx, desk.floor.siteId);

    const updated = await ctx.db.desk.update({
      where: { id: input.deskId },
      data: {
        number: input.number,
        name: input.name,
        x: input.x,
        y: input.y,
        spaceType: input.spaceType,
      },
    });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "UPDATE",
        targetType: "Desk",
        targetId: desk.id,
        before: { number: desk.number },
        after: { number: updated.number },
      },
    });

    return updated;
  }),

  /**
   * Delete a desk.
   * FACILITY_ADMIN or higher.
   */
  deleteDesk: siteAdminProcedure
    .input(z.object({ deskId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const desk = await ctx.db.desk.findUnique({
        where: { id: input.deskId },
        include: { floor: true },
      });
      if (!desk) throw new TRPCError({ code: "NOT_FOUND" });

      await assertFacilityAdmin(ctx, desk.floor.siteId);

      await ctx.db.desk.delete({ where: { id: input.deskId } });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "DELETE",
          targetType: "Desk",
          targetId: desk.id,
          before: { number: desk.number },
        },
      });
    }),

  /**
   * Add attribute to a desk.
   */
  addAttribute: siteAdminProcedure
    .input(z.object({ deskId: z.string().min(1), type: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const desk = await ctx.db.desk.findUnique({
        where: { id: input.deskId },
        include: { floor: true },
      });
      if (!desk) throw new TRPCError({ code: "NOT_FOUND" });

      await assertFacilityAdmin(ctx, desk.floor.siteId);

      const existing = await ctx.db.deskAttribute.findUnique({
        where: { deskId_type: { deskId: input.deskId, type: input.type } },
      });
      if (existing) return existing;

      return ctx.db.deskAttribute.create({
        data: {
          organizationId: ctx.organizationId,
          deskId: input.deskId,
          type: input.type,
        },
      });
    }),

  /**
   * Remove attribute from a desk.
   */
  removeAttribute: siteAdminProcedure
    .input(z.object({ deskId: z.string().min(1), type: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const desk = await ctx.db.desk.findUnique({
        where: { id: input.deskId },
        include: { floor: true },
      });
      if (!desk) throw new TRPCError({ code: "NOT_FOUND" });

      await assertFacilityAdmin(ctx, desk.floor.siteId);

      await ctx.db.deskAttribute.deleteMany({
        where: { deskId: input.deskId, type: input.type },
      });
    }),
});
