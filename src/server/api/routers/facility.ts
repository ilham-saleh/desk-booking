/**
 * Facility/Site management router — full CRUD for sites with per-day operating hours.
 * Access: ORG_SUPER_ADMIN (all sites) or FACILITY_ADMIN (assigned sites only).
 */

import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, orgProcedure, siteAdminProcedure, orgAdminProcedure, assertSiteAdmin } from "@/server/api/trpc";
import { isOrgSuperAdmin } from "@/server/auth/roles";
import {
  facilityCreateInputSchema,
  type FacilityCreateInput,
  facilityUpdateInputSchema,
  type FacilityUpdateInput,
  operatingHoursInputSchema,
  type OperatingHoursInput,
} from "@/lib/schemas/facility";

// Re-export for backward compatibility
export { facilityCreateInputSchema, type FacilityCreateInput, facilityUpdateInputSchema, type FacilityUpdateInput, operatingHoursInputSchema, type OperatingHoursInput };

export const facilityRouter = createTRPCRouter({
  /**
   * List all facilities (org-scoped).
   * ORG_SUPER_ADMIN: all sites in org
   * FACILITY_ADMIN: only assigned sites
   */
  list: siteAdminProcedure.query(async ({ ctx }) => {
    // If org super admin, return all sites; otherwise only those with permissions
    if (isOrgSuperAdmin(ctx.session)) {
      return ctx.db.site.findMany({
        where: { organizationId: ctx.organizationId },
        include: {
          _count: { select: { floors: true } },
          operatingHours: { orderBy: { dayOfWeek: "asc" } },
        },
        orderBy: { name: "asc" },
      });
    }

    // Facility admin: return only sites they have permission for
    const permissions = await ctx.db.permission.findMany({
      where: { userId: ctx.session.user.id },
      select: { siteId: true },
    });
    const siteIds = permissions.map((p) => p.siteId);

    if (siteIds.length === 0) return [];

    return ctx.db.site.findMany({
      where: { organizationId: ctx.organizationId, id: { in: siteIds } },
      include: {
        _count: { select: { floors: true } },
        operatingHours: { orderBy: { dayOfWeek: "asc" } },
      },
      orderBy: { name: "asc" },
    });
  }),

  /**
   * Get a single facility by ID.
   */
  get: siteAdminProcedure.input(z.object({ siteId: z.string().min(1) })).query(async ({ ctx, input }) => {
    await assertSiteAdmin(ctx, input.siteId);

    const site = await ctx.db.site.findUnique({
      where: { id: input.siteId },
      include: {
        floors: { orderBy: { sortOrder: "asc" } },
        operatingHours: { orderBy: { dayOfWeek: "asc" } },
      },
    });

    if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Facility not found." });
    return site;
  }),

  /**
   * Create a new facility.
   * ORG_SUPER_ADMIN only.
   */
  create: orgAdminProcedure.input(facilityCreateInputSchema).mutation(async ({ ctx, input }) => {
    const site = await ctx.db.site.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        address: input.address,
        city: input.city,
        country: input.country,
        postalCode: input.postalCode,
        description: input.description,
        timeZone: input.timeZone,
        unitSystem: input.unitSystem || "METRIC",
        allowEmployeeSeeBookings: input.allowEmployeeSeeBookings !== false,
      },
    });

    // Audit log (omit before for creates; after is the summary of what was created)
    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "CREATE",
        targetType: "Site",
        targetId: site.id,
        after: { name: site.name, city: site.city, country: site.country },
      },
    });

    return site;
  }),

  /**
   * Update a facility.
   * ORG_SUPER_ADMIN: any site
   * FACILITY_ADMIN: only assigned sites
   */
  update: siteAdminProcedure.input(facilityUpdateInputSchema).mutation(async ({ ctx, input }) => {
    await assertSiteAdmin(ctx, input.siteId);

    const before = await ctx.db.site.findUnique({ where: { id: input.siteId } });

    const site = await ctx.db.site.update({
      where: { id: input.siteId },
      data: {
        name: input.name,
        address: input.address,
        city: input.city,
        country: input.country,
        postalCode: input.postalCode,
        description: input.description,
        timeZone: input.timeZone,
        unitSystem: input.unitSystem,
        allowEmployeeSeeBookings: input.allowEmployeeSeeBookings,
      },
    });

    // Audit log
    if (before) {
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "UPDATE",
          targetType: "Site",
          targetId: site.id,
          before: { name: before.name },
          after: { name: site.name, city: site.city },
        },
      });
    }

    return site;
  }),

  /**
   * Delete a facility.
   * ORG_SUPER_ADMIN only.
   * Cascade deletes floors, desks, etc.
   */
  delete: orgAdminProcedure.input(z.object({ siteId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const site = await ctx.db.site.findUnique({ where: { id: input.siteId } });
    if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Facility not found." });

    await ctx.db.site.delete({ where: { id: input.siteId } });

    // Audit log
    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "DELETE",
        targetType: "Site",
        targetId: site.id,
        before: { name: site.name },
      },
    });
  }),

  /**
   * Get operating hours for a facility.
   */
  getOperatingHours: orgProcedure
    .input(z.object({ siteId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const hours = await ctx.db.siteOperatingHours.findMany({
        where: { siteId: input.siteId },
        orderBy: { dayOfWeek: "asc" },
      });
      return hours;
    }),

  /**
   * Update operating hours for a facility.
   * ORG_SUPER_ADMIN or FACILITY_ADMIN with permission.
   */
  updateOperatingHours: siteAdminProcedure
    .input(
      z.object({
        siteId: z.string().min(1),
        hours: operatingHoursInputSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertSiteAdmin(ctx, input.siteId);

      // Delete existing hours for this site
      await ctx.db.siteOperatingHours.deleteMany({ where: { siteId: input.siteId } });

      // Create new hours
      await ctx.db.siteOperatingHours.createMany({
        data: input.hours.map((h) => ({
          organizationId: ctx.organizationId,
          siteId: input.siteId,
          dayOfWeek: h.dayOfWeek,
          openAtMinutes: h.openAtMinutes,
          closeAtMinutes: h.closeAtMinutes,
        })),
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "UPDATE",
          targetType: "SiteOperatingHours",
          targetId: input.siteId,
          after: input.hours,
        },
      });
    }),
});
