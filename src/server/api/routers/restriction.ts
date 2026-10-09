/**
 * Booking restrictions and departments router — reusable "custom restriction
 * by employee field" records (name, colour, ordered AND/OR rules) that many
 * desks share through DeskRestrictionAssignment, plus the department list the
 * rule builder and desk department selector draw from.
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
import { matchesRules } from "@/lib/restrictions";
import type { ScopedDb } from "@/server/tenancy";

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

const rulesInclude = { rules: { orderBy: { sortOrder: "asc" as const } } } as const;

/** Distinct desks / floors each restriction is assigned to — for "assigned to 12 desks" warnings. */
async function usageByRestriction(db: ScopedDb, restrictionIds: string[]) {
  if (restrictionIds.length === 0) return new Map<string, { deskCount: number; floorCount: number }>();
  const rows = await db.deskRestrictionAssignment.findMany({
    where: { restrictionId: { in: restrictionIds }, desk: { archivedAt: null } },
    select: { restrictionId: true, deskId: true, desk: { select: { floorId: true } } },
  });
  const usage = new Map<string, { desks: Set<string>; floors: Set<string> }>();
  for (const row of rows) {
    const entry = usage.get(row.restrictionId!) ?? { desks: new Set<string>(), floors: new Set<string>() };
    entry.desks.add(row.deskId);
    entry.floors.add(row.desk.floorId);
    usage.set(row.restrictionId!, entry);
  }
  return new Map([...usage.entries()].map(([id, u]) => [id, { deskCount: u.desks.size, floorCount: u.floors.size }]));
}

function rulesToCreateData(rules: RestrictionRuleInput[]) {
  return rules.map((rule, index) => ({
    fieldType: rule.fieldType,
    operator: rule.operator,
    value: rule.operator === "IS_EMPTY" || rule.operator === "IS_NOT_EMPTY" ? [] : rule.value,
    connector: rule.connector,
    sortOrder: index,
  }));
}

export const restrictionRouter = createTRPCRouter({
  // ===== DEPARTMENTS =====

  /** Managed department records (used by the desk Department selector). */
  listDepartments: orgProcedure.query(({ ctx }) =>
    ctx.db.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ),

  /**
   * Department names for restriction rules and department blocks — exactly the
   * departments that exist on employee records (Entra-owned, as shown on the
   * Users page), so a rule can never target a department nobody belongs to.
   */
  listDepartmentOptions: orgProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { department: { not: null }, isActive: true },
      select: { department: true },
      distinct: ["department"],
    });
    const names = new Set<string>();
    for (const u of users) if (u.department && u.department.trim().length > 0) names.add(u.department.trim());
    return [...names].sort((a, b) => a.localeCompare(b));
  }),

  /** Job titles on active employee records (Entra-owned), for Job title rules — same sourcing as departments. */
  listJobTitleOptions: siteAdminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { title: { not: null }, isActive: true },
      select: { title: true },
      distinct: ["title"],
    });
    const titles = new Set<string>();
    for (const u of users) if (u.title && u.title.trim().length > 0) titles.add(u.title.trim());
    return [...titles].sort((a, b) => a.localeCompare(b));
  }),

  createDepartment: siteAdminProcedure.input(departmentCreateInputSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.department.findFirst({ where: { name: input.name } });
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Department already exists" });

    const department = await ctx.db.department.create({
      data: { organizationId: ctx.organizationId, name: input.name },
    });

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

  deleteDepartment: siteAdminProcedure.input(z.object({ departmentId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const department = await ctx.db.department.findFirst({ where: { id: input.departmentId } });
    if (!department) throw new TRPCError({ code: "NOT_FOUND" });

    await ctx.db.department.update({ where: { id: input.departmentId }, data: { isActive: false } });

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

  /** All active restrictions with ordered rules and how many desks/floors use each. */
  listRestrictions: orgProcedure.query(async ({ ctx }) => {
    const restrictions = await ctx.db.bookingRestriction.findMany({
      where: { isActive: true },
      include: rulesInclude,
      orderBy: { name: "asc" },
    });
    const usage = await usageByRestriction(ctx.db, restrictions.map((r) => r.id));
    return restrictions.map((restriction) => ({
      ...restriction,
      deskCount: usage.get(restriction.id)?.deskCount ?? 0,
      floorCount: usage.get(restriction.id)?.floorCount ?? 0,
    }));
  }),

  getRestriction: orgProcedure.input(z.object({ restrictionId: z.string().min(1) })).query(async ({ ctx, input }) => {
    const restriction = await ctx.db.bookingRestriction.findFirst({
      where: { id: input.restrictionId },
      include: rulesInclude,
    });
    if (!restriction) throw new TRPCError({ code: "NOT_FOUND", message: "Restriction not found." });
    const usage = await usageByRestriction(ctx.db, [restriction.id]);
    return { ...restriction, deskCount: usage.get(restriction.id)?.deskCount ?? 0, floorCount: usage.get(restriction.id)?.floorCount ?? 0 };
  }),

  createRestriction: siteAdminProcedure.input(restrictionCreateInputSchema).mutation(async ({ ctx, input }) => {
    // Names are unique per org including soft-deleted rows, so a deleted
    // restriction with the same name is revived rather than duplicated.
    const existing = await ctx.db.bookingRestriction.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" } },
    });
    if (existing?.isActive) throw new TRPCError({ code: "CONFLICT", message: `A restriction named "${input.name}" already exists.` });

    const restriction = existing
      ? await ctx.db.$transaction(async (tx) => {
          await tx.restrictionRule.deleteMany({ where: { restrictionId: existing.id } });
          return tx.bookingRestriction.update({
            where: { id: existing.id },
            data: { name: input.name, color: input.color ?? null, isActive: true, rules: { create: rulesToCreateData(input.rules) } },
            include: rulesInclude,
          });
        })
      : await ctx.db.bookingRestriction.create({
          data: {
            organizationId: ctx.organizationId,
            name: input.name,
            color: input.color ?? null,
            rules: { create: rulesToCreateData(input.rules) },
          },
          include: rulesInclude,
        });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "CREATE",
        targetType: "BookingRestriction",
        targetId: restriction.id,
        after: { name: restriction.name, color: restriction.color, ruleCount: restriction.rules.length },
      },
    });

    return restriction;
  }),

  /** Replace name, colour and the whole rule list. Desks assigned to it pick the change up immediately. */
  updateRestriction: siteAdminProcedure.input(restrictionUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const restriction = await ctx.db.bookingRestriction.findFirst({
      where: { id: input.restrictionId, isActive: true },
      include: rulesInclude,
    });
    if (!restriction) throw new TRPCError({ code: "NOT_FOUND", message: "Restriction not found." });

    const clash = await ctx.db.bookingRestriction.findFirst({
      where: { id: { not: restriction.id }, name: { equals: input.name, mode: "insensitive" } },
    });
    if (clash?.isActive) throw new TRPCError({ code: "CONFLICT", message: `A restriction named "${input.name}" already exists.` });

    const updated = await ctx.db.$transaction(async (tx) => {
      // A soft-deleted restriction holding this name is fully detached (its blocks were removed on delete) — clear it so the rename can proceed.
      if (clash) await tx.bookingRestriction.delete({ where: { id: clash.id } });
      await tx.restrictionRule.deleteMany({ where: { restrictionId: restriction.id } });
      return tx.bookingRestriction.update({
        where: { id: restriction.id },
        data: {
          name: input.name,
          color: input.color ?? null,
          rules: { create: rulesToCreateData(input.rules) },
        },
        include: rulesInclude,
      });
    });

    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "UPDATE",
        targetType: "BookingRestriction",
        targetId: restriction.id,
        before: { name: restriction.name, ruleCount: restriction.rules.length },
        after: { name: updated.name, color: updated.color, ruleCount: updated.rules.length },
      },
    });

    return updated;
  }),

  /**
   * Soft-delete a restriction. When desks still use it the call is refused
   * with the count unless `force` is set — the UI shows that count in its
   * confirmation and, on confirm, the dependent restriction blocks are removed
   * from those desks too (never left dangling).
   */
  deleteRestriction: siteAdminProcedure
    .input(z.object({ restrictionId: z.string().min(1), force: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const restriction = await ctx.db.bookingRestriction.findFirst({ where: { id: input.restrictionId, isActive: true } });
      if (!restriction) throw new TRPCError({ code: "NOT_FOUND", message: "Restriction not found." });

      const usage = (await usageByRestriction(ctx.db, [restriction.id])).get(restriction.id) ?? { deskCount: 0, floorCount: 0 };
      if (usage.deskCount > 0 && !input.force) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `This restriction is currently assigned to ${usage.deskCount} desk${usage.deskCount === 1 ? "" : "s"}. Confirm to remove it from those desks as well.`,
        });
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.deskRestrictionAssignment.deleteMany({ where: { restrictionId: restriction.id } });
        await tx.bookingRestriction.update({ where: { id: restriction.id }, data: { isActive: false } });
      });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "DELETE",
          targetType: "BookingRestriction",
          targetId: restriction.id,
          before: { name: restriction.name, removedFromDesks: usage.deskCount },
        },
      });

      return { removedFromDesks: usage.deskCount };
    }),

  /**
   * Live "N employee records match these rules" for the rule builder —
   * computed against real active employees with the same matcher booking
   * validation uses. Never a fake number.
   */
  previewMatchCount: siteAdminProcedure
    .input(z.object({ rules: z.array(restrictionRuleSchema).max(50) }))
    .query(async ({ ctx, input }) => {
      const employees = await ctx.db.user.findMany({
        where: { isActive: true },
        select: { id: true, email: true, department: true, title: true },
      });
      const rules = input.rules.map((rule, index) => ({ ...rule, sortOrder: index }));
      const matching = employees.filter((employee) => matchesRules(rules, employee)).length;
      return { matching, total: employees.length };
    }),
});
