/**
 * Booking restrictions and departments router — reusable restriction groups
 * and per-desk availability shifts with multi-day/multi-restriction support.
 */

import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, orgProcedure, siteAdminProcedure } from "@/server/api/trpc";
import {
  departmentCreateInputSchema,
  type DepartmentCreateInput,
  restrictionRuleSchema,
  type RestrictionRuleInput,
  restrictionCreateInputSchema,
  type RestrictionCreateInput,
  restrictionUpdateInputSchema,
  type RestrictionUpdateInput,
} from "@/lib/schemas/restriction";

// Re-export for backward compatibility
export {
  departmentCreateInputSchema,
  type DepartmentCreateInput,
  restrictionRuleSchema,
  type RestrictionRuleInput,
  restrictionCreateInputSchema,
  type RestrictionCreateInput,
  restrictionUpdateInputSchema,
  type RestrictionUpdateInput,
};

export const restrictionRouter = createTRPCRouter({
  // ===== DEPARTMENTS =====

  /**
   * List all departments in the organization.
   */
  listDepartments: orgProcedure.query(({ ctx }) =>
    ctx.db.department.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ),

  /**
   * Create a new department.
   * FACILITY_ADMIN or higher.
   */
  createDepartment: siteAdminProcedure
    .input(departmentCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if department already exists
      const existing = await ctx.db.department.findFirst({
        where: { organizationId: ctx.organizationId, name: input.name },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Department already exists" });
      }

      const department = await ctx.db.department.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
        },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "CREATE",
          targetType: "Department",
          targetId: department.id,
          after: { name: department.name },
        },
      });

      return department;
    }),

  /**
   * Delete a department (soft-delete via isActive = false).
   * FACILITY_ADMIN or higher.
   */
  deleteDepartment: siteAdminProcedure
    .input(z.object({ departmentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const department = await ctx.db.department.findUnique({ where: { id: input.departmentId } });
      if (!department) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.department.update({
        where: { id: input.departmentId },
        data: { isActive: false },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "DELETE",
          targetType: "Department",
          targetId: department.id,
          before: { name: department.name },
        },
      });
    }),

  // ===== BOOKING RESTRICTIONS =====

  /**
   * List all booking restrictions in the organization.
   */
  listRestrictions: orgProcedure.query(({ ctx }) =>
    ctx.db.bookingRestriction.findMany({
      where: { organizationId: ctx.organizationId, isActive: true },
      include: { rules: true },
      orderBy: { name: "asc" },
    }),
  ),

  /**
   * Get a single restriction with its rules.
   */
  getRestriction: orgProcedure
    .input(z.object({ restrictionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const restriction = await ctx.db.bookingRestriction.findUnique({
        where: { id: input.restrictionId },
        include: { rules: true },
      });
      if (!restriction) throw new TRPCError({ code: "NOT_FOUND" });
      return restriction;
    }),

  /**
   * Create a new booking restriction.
   * FACILITY_ADMIN or higher.
   */
  createRestriction: siteAdminProcedure
    .input(restrictionCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if restriction with this name already exists
      const existing = await ctx.db.bookingRestriction.findFirst({
        where: { organizationId: ctx.organizationId, name: input.name },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Restriction already exists" });
      }

      const restriction = await ctx.db.bookingRestriction.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          rules: input.rules
            ? {
                create: input.rules.map((rule) => ({
                  fieldType: rule.fieldType,
                  operator: rule.operator,
                  value: Array.isArray(rule.value) ? rule.value : [rule.value],
                })),
              }
            : undefined,
        },
        include: { rules: true },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "CREATE",
          targetType: "BookingRestriction",
          targetId: restriction.id,
          after: { name: restriction.name, ruleCount: restriction.rules.length },
        },
      });

      return restriction;
    }),

  /**
   * Update a booking restriction (name + rules).
   * FACILITY_ADMIN or higher.
   */
  updateRestriction: siteAdminProcedure
    .input(restrictionUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const restriction = await ctx.db.bookingRestriction.findUnique({
        where: { id: input.restrictionId },
      });
      if (!restriction) throw new TRPCError({ code: "NOT_FOUND" });

      // Delete old rules, create new ones
      await ctx.db.restrictionRule.deleteMany({ where: { restrictionId: input.restrictionId } });

      const updated = await ctx.db.bookingRestriction.update({
        where: { id: input.restrictionId },
        data: {
          name: input.name,
          rules: input.rules
            ? {
                create: input.rules.map((rule) => ({
                  fieldType: rule.fieldType,
                  operator: rule.operator,
                  value: Array.isArray(rule.value) ? rule.value : [rule.value],
                })),
              }
            : undefined,
        },
        include: { rules: true },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "UPDATE",
          targetType: "BookingRestriction",
          targetId: restriction.id,
          before: { name: restriction.name },
          after: { name: updated.name, ruleCount: updated.rules.length },
        },
      });

      return updated;
    }),

  /**
   * Delete a booking restriction (soft-delete via isActive = false).
   * FACILITY_ADMIN or higher.
   */
  deleteRestriction: siteAdminProcedure
    .input(z.object({ restrictionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const restriction = await ctx.db.bookingRestriction.findUnique({
        where: { id: input.restrictionId },
      });
      if (!restriction) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.bookingRestriction.update({
        where: { id: input.restrictionId },
        data: { isActive: false },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "DELETE",
          targetType: "BookingRestriction",
          targetId: restriction.id,
          before: { name: restriction.name },
        },
      });
    }),

  /**
   * Validate if a user matches a restriction.
   * Used to check booking eligibility (occupant against desk restriction).
   */
  validateUserAgainstRestriction: orgProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        restrictionId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.userId } });
      const restriction = await ctx.db.bookingRestriction.findUnique({
        where: { id: input.restrictionId },
        include: { rules: true },
      });

      if (!user || !restriction) return { matches: false, reason: "User or restriction not found" };

      // If no rules, everyone matches
      if (restriction.rules.length === 0) return { matches: true, reason: "No restrictions" };

      // Evaluate each rule
      for (const rule of restriction.rules) {
        const ruleValues = Array.isArray(rule.value) ? rule.value : [rule.value];
        let ruleMatches = false;

        switch (rule.fieldType) {
          case "DEPARTMENT":
            ruleMatches = ruleValues.includes(user.department || "");
            break;
          case "EMAIL":
            ruleMatches = ruleValues.includes(user.email);
            break;
          case "USER":
            ruleMatches = ruleValues.includes(user.id);
            break;
        }

        // Apply operator logic
        if (rule.operator.startsWith("IS_NOT")) {
          ruleMatches = !ruleMatches;
        }

        // For now, treat rules as OR (any rule matching = eligible)
        // TODO: support AND/OR logic per restriction
        if (ruleMatches) return { matches: true, reason: "Matches restriction" };
      }

      return {
        matches: false,
        reason: `User does not match restriction (department: ${user.department || "none"})`,
      };
    }),
});
