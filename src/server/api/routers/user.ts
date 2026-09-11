import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, orgProcedure, siteAdminProcedure, orgAdminProcedure } from "@/server/api/trpc";
import { isOrgSuperAdmin } from "@/server/auth/roles";
import { Role } from "@/generated/prisma/enums";

export const userUpdateInputSchema = z.object({
  userId: z.string().min(1),
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(Role).optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type UserUpdateInput = z.infer<typeof userUpdateInputSchema>;

export const userRouter = createTRPCRouter({
  /** Org-wide user directory (CLAUDE.md rule 10) — used to pick who a booking-on-behalf is for. */
  listActive: siteAdminProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ),

  /**
   * List all users in the organization.
   * ORG_SUPER_ADMIN: all users in org
   * FACILITY_ADMIN: users with permissions for their assigned facilities
   */
  list: siteAdminProcedure.query(async ({ ctx }) => {
    // If org super admin, return all users
    if (isOrgSuperAdmin(ctx.session)) {
      return ctx.db.user.findMany({
        where: { organizationId: ctx.organizationId },
        include: { permissions: true },
        orderBy: { name: "asc" },
      });
    }

    // Facility admin: return users with permissions for their assigned facilities
    const adminPermissions = await ctx.db.permission.findMany({
      where: { userId: ctx.session.user.id },
      select: { siteId: true },
    });

    if (adminPermissions.length === 0) return [];

    const siteIds = adminPermissions.map((p) => p.siteId);

    const users = await ctx.db.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        permissions: { some: { siteId: { in: siteIds } } },
      },
      include: { permissions: true },
      orderBy: { name: "asc" },
    });

    return users;
  }),

  /**
   * Get a single user with all permissions and booking history.
   */
  get: siteAdminProcedure.input(z.object({ userId: z.string().min(1) })).query(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: input.userId },
      include: {
        permissions: { include: { site: true } },
        bookingsAsUser: { take: 10, orderBy: { createdAt: "desc" } },
      },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
    return user;
  }),

  /**
   * Update a user's basic info and role.
   * ORG_SUPER_ADMIN only (can change roles).
   * FACILITY_ADMIN can only update department/timezone.
   */
  update: siteAdminProcedure.input(userUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.db.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });

    // Only ORG_SUPER_ADMIN can change roles or deactivate users
    if ((input.role || input.isActive !== undefined) && !isOrgSuperAdmin(ctx.session)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only org admins can change user roles or activation status.",
      });
    }

    const updated = await ctx.db.user.update({
      where: { id: input.userId },
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        department: input.department,
        phone: input.phone,
        timezone: input.timezone,
        isActive: input.isActive,
      },
      include: { permissions: true },
    });

    // Audit log
    await ctx.db.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.session.user.id,
        action: "UPDATE",
        targetType: "User",
        targetId: user.id,
        before: { name: user.name, role: user.role },
        after: { name: updated.name, role: updated.role },
      },
    });

    return updated;
  }),

  /**
   * Assign a user to a facility (create Permission).
   * ORG_SUPER_ADMIN only.
   */
  assignFacility: orgAdminProcedure
    .input(z.object({ userId: z.string().min(1), siteId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({ where: { id: input.userId } });
      const site = await ctx.db.site.findUnique({ where: { id: input.siteId } });

      if (!user || !site) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = await ctx.db.permission.findUnique({
        where: { userId_siteId: { userId: input.userId, siteId: input.siteId } },
      });
      if (existing) return existing;

      const permission = await ctx.db.permission.create({
        data: {
          organizationId: ctx.organizationId,
          userId: input.userId,
          siteId: input.siteId,
        },
      });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "CREATE",
          targetType: "Permission",
          targetId: permission.id,
          after: { userName: user.name, siteName: site.name },
        },
      });

      return permission;
    }),

  /**
   * Revoke a user's facility access (delete Permission).
   * ORG_SUPER_ADMIN only.
   */
  revokeFacility: orgAdminProcedure
    .input(z.object({ userId: z.string().min(1), siteId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const permission = await ctx.db.permission.findUnique({
        where: { userId_siteId: { userId: input.userId, siteId: input.siteId } },
      });
      if (!permission) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.permission.delete({ where: { id: permission.id } });

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "DELETE",
          targetType: "Permission",
          targetId: permission.id,
          before: { userId: input.userId, siteId: input.siteId },
        },
      });
    }),

  /**
   * Get all permissions for a user.
   */
  getPermissions: orgProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const permissions = await ctx.db.permission.findMany({
        where: { userId: input.userId },
        include: { site: true },
      });
      return permissions;
    }),
});
