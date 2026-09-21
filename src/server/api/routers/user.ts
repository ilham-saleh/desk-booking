import "server-only";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { PermissionType, Role } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { permissionSummary, permissionTypeForRole, roleLabel } from "@/lib/roles";
import {
  deactivateUsersInputSchema,
  removeSitePermissionInputSchema,
  sitePermissionInputSchema,
  userDirectoryInputSchema,
  userSaveInputSchema,
} from "@/lib/schemas/user";
import { bookingManagerProcedure, createTRPCRouter, siteAdminProcedure } from "@/server/api/trpc";
import {
  canAssignRole,
  canAssignSitePermission,
  canManageUser,
  getManagedSiteIds,
  manageableUsersWhere,
  type AuthzCtx,
} from "@/server/auth/authorization";
import type { ScopedDb } from "@/server/tenancy";

/**
 * Users administration (tasks/users-management.md) plus the small directory
 * lookups the booking flows need. Profile fields (names, email, title,
 * department, location) are HRIS-owned; role, isActive and Permission rows are
 * application-owned. Nothing here touches title/department — the HRIS sync
 * will own them next phase.
 */

const permissionWithSite = { include: { site: { select: { id: true, name: true, city: true } } }, orderBy: { site: { name: "asc" as const } } };

const userDetailInclude = {
  permissions: permissionWithSite,
  bookingsAsUser: {
    take: 10,
    orderBy: { startAt: "desc" as const },
    include: { desk: { select: { number: true, floor: { select: { name: true, site: { select: { name: true } } } } } } },
  },
} satisfies Prisma.UserInclude;

/** Loads a target user and refuses unless the actor may manage them (see canManageUser). */
async function loadManagedUser(ctx: AuthzCtx, userId: string) {
  const user = await ctx.db.user.findUnique({ where: { id: userId }, include: userDetailInclude });
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
  const managed = await getManagedSiteIds(ctx);
  if (!canManageUser(ctx.session, user, managed)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to manage this user." });
  }
  return { user, managed };
}

/** Site names backing the readable Permissions column for one user. */
function applicableSiteNames(user: { role: Role; permissions: Array<{ type: PermissionType; site: { name: string } }> }): string[] {
  const type = permissionTypeForRole(user.role);
  if (!type) return [];
  return user.permissions.filter((permission) => permission.type === type).map((permission) => permission.site.name);
}

function toDirectoryRow(user: {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  title: string | null;
  department: string | null;
  location: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  permissions: Array<{ siteId: string; type: PermissionType; site: { id: string; name: string } }>;
}) {
  const siteNames = applicableSiteNames(user);
  return {
    id: user.id,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    title: user.title,
    department: user.department,
    location: user.location,
    role: user.role,
    roleLabel: roleLabel(user.role),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    permissionSummary: permissionSummary(user.role, siteNames),
    permissionSites: siteNames,
  };
}

async function audit(
  db: ScopedDb,
  organizationId: string,
  actorId: string,
  action: string,
  targetId: string,
  before: Prisma.InputJsonValue | undefined,
  after: Prisma.InputJsonValue | undefined,
) {
  await db.auditLog.create({ data: { organizationId, actorId, action, targetType: "User", targetId, before, after } });
}

export const userRouter = createTRPCRouter({
  /**
   * Active employees for the "book for another user" pickers. Open to Booking
   * Managers as well as admins — site scope is enforced when the booking is made.
   */
  listActive: bookingManagerProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ),

  /**
   * Server-side employee search for the restriction rule builder and
   * occupant pickers — never ships the whole directory to the client.
   */
  search: bookingManagerProcedure
    .input(z.object({ query: z.string().trim().max(120).default(""), ids: z.array(z.string()).max(500).optional(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const query = input.query;
      const users = await ctx.db.user.findMany({
        where: {
          isActive: true,
          ...(input.ids
            ? { id: { in: input.ids } }
            : query.length > 0
              ? {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                    { department: { contains: query, mode: "insensitive" } },
                  ],
                }
              : {}),
        },
        select: { id: true, name: true, email: true, department: true },
        orderBy: { name: "asc" },
        take: input.ids ? input.ids.length : input.limit,
      });
      return users;
    }),

  /**
   * Paginated Users table. System Admin sees the whole organization; a
   * Facility Admin sees only the users they may manage (see canManageUser).
   * Search covers first/last/full name and email; role and status filter
   * records; sorting by role follows the enum's broadest-first order.
   */
  listDirectory: siteAdminProcedure.input(userDirectoryInputSchema).query(async ({ ctx, input }) => {
    const managed = await getManagedSiteIds(ctx);
    const where: Prisma.UserWhereInput = {
      AND: [
        manageableUsersWhere(ctx.session, managed),
        input.status === "all" ? {} : { isActive: input.status === "active" },
        input.role ? { role: input.role } : {},
        input.search.length > 0
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" } },
                { firstName: { contains: input.search, mode: "insensitive" } },
                { lastName: { contains: input.search, mode: "insensitive" } },
                { email: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      input.sortBy === "lastLoginAt"
        ? [{ lastLoginAt: { sort: input.sortDir, nulls: "last" } }, { name: "asc" }]
        : [{ [input.sortBy]: input.sortDir }, ...(input.sortBy === "name" ? [] : [{ name: "asc" as const }])];

    const [total, users] = await Promise.all([
      ctx.db.user.count({ where }),
      ctx.db.user.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { permissions: permissionWithSite },
      }),
    ]);

    return {
      items: users.map(toDirectoryRow),
      total,
      page: input.page,
      pageSize: input.pageSize,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    };
  }),

  /** User Details page payload: profile, role, permissions with sites, recent bookings, and what the actor may do. */
  get: siteAdminProcedure.input(z.object({ userId: z.string().min(1) })).query(async ({ ctx, input }) => {
    const { user, managed } = await loadManagedUser(ctx, input.userId);
    const applicableType = permissionTypeForRole(user.role);

    // Sites the actor may grant to this user, minus the ones already granted.
    const grantable = await ctx.db.site.findMany({
      where: managed === null ? {} : { id: { in: [...managed] } },
      select: { id: true, name: true, city: true },
      orderBy: { name: "asc" },
    });
    const held = new Set(user.permissions.filter((permission) => permission.type === applicableType).map((permission) => permission.siteId));

    return {
      ...toDirectoryRow(user),
      employeeId: user.employeeId,
      phone: user.phone,
      timezone: user.timezone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      permissions: user.permissions
        .filter((permission) => permission.type === applicableType)
        .map((permission) => ({ siteId: permission.siteId, siteName: permission.site.name, city: permission.site.city, type: permission.type })),
      availableSites: applicableType ? grantable.filter((site) => !held.has(site.id)) : [],
      recentBookings: user.bookingsAsUser.map((booking) => ({
        id: booking.id,
        status: booking.status,
        startAt: booking.startAt,
        endAt: booking.endAt,
        deskNumber: booking.desk.number,
        floorName: booking.desk.floor.name,
        siteName: booking.desk.floor.site.name,
      })),
      assignableRoles: [Role.ORG_SUPER_ADMIN, Role.SITE_ADMIN, Role.BOOKING_MANAGER, Role.STANDARD_USER].filter((role) => canAssignRole(ctx.session, role)),
      isSelf: user.id === ctx.session.user.id,
    };
  }),

  /**
   * Save User: profile fields + role. A role change removes Permission rows the
   * new role can't use, so a demoted Facility Admin keeps no hidden site access
   * and a promoted Booking Manager gains no site until an admin assigns it.
   */
  save: siteAdminProcedure.input(userSaveInputSchema).mutation(async ({ ctx, input }) => {
    const { user } = await loadManagedUser(ctx, input.userId);

    const roleChanged = input.role !== user.role;
    if (roleChanged) {
      if (user.id === ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't change your own role." });
      }
      if (!canAssignRole(ctx.session, input.role) || !canAssignRole(ctx.session, user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: `You don't have permission to assign the ${roleLabel(input.role)} role.` });
      }
    }

    if (input.email !== user.email) {
      const clash = await ctx.db.user.findFirst({ where: { email: input.email, id: { not: user.id } }, select: { id: true } });
      if (clash) throw new TRPCError({ code: "CONFLICT", message: `Another user already uses ${input.email}.` });
    }

    const keepType = permissionTypeForRole(input.role);
    const removedPermissions = roleChanged ? user.permissions.filter((permission) => permission.type !== keepType) : [];

    const updated = await ctx.db.$transaction(async (tx) => {
      if (removedPermissions.length > 0) {
        await tx.permission.deleteMany({ where: { userId: user.id, id: { in: removedPermissions.map((permission) => permission.id) } } });
      }
      return tx.user.update({
        where: { id: user.id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          name: `${input.firstName} ${input.lastName}`.trim(),
          email: input.email,
          location: input.location,
          role: input.role,
        },
        include: { permissions: permissionWithSite },
      });
    });

    await audit(
      ctx.db,
      ctx.organizationId,
      ctx.session.user.id,
      roleChanged ? "user.roleChanged" : "user.profileUpdated",
      user.id,
      { name: user.name, email: user.email, location: user.location, role: user.role, removedSitePermissions: removedPermissions.map((permission) => ({ siteId: permission.siteId, type: permission.type })) },
      { name: updated.name, email: updated.email, location: updated.location, role: updated.role },
    );

    return { ...toDirectoryRow(updated), removedPermissionCount: removedPermissions.length };
  }),

  /**
   * Add Selected: grant the target site permissions of the type their role
   * uses (Facility Admin → manages the site, Booking Manager → may book for
   * others there). Sites outside the actor's own scope are refused.
   */
  addSitePermissions: siteAdminProcedure.input(sitePermissionInputSchema).mutation(async ({ ctx, input }) => {
    const { user } = await loadManagedUser(ctx, input.userId);
    const type = permissionTypeForRole(user.role);
    if (!type) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${roleLabel(user.role)} accounts don't take site permissions. Change the role to Facility Admin or Booking Manager first.`,
      });
    }

    const sites = await ctx.db.site.findMany({ where: { id: { in: input.siteIds } }, select: { id: true, name: true } });
    if (sites.length !== new Set(input.siteIds).size) {
      throw new TRPCError({ code: "NOT_FOUND", message: "One of the selected sites no longer exists." });
    }
    for (const site of sites) {
      if (!(await canAssignSitePermission(ctx, site.id))) {
        throw new TRPCError({ code: "FORBIDDEN", message: `You don't manage ${site.name}, so you can't grant it.` });
      }
    }

    const existing = new Set(user.permissions.map((permission) => permission.siteId));
    const toCreate = sites.filter((site) => !existing.has(site.id));
    if (toCreate.length > 0) {
      await ctx.db.permission.createMany({
        data: toCreate.map((site) => ({ organizationId: ctx.organizationId, userId: user.id, siteId: site.id, type })),
      });
    }
    // A row of the other type for the same site (left over from an earlier role) is retyped rather than duplicated.
    const toRetype = user.permissions.filter((permission) => permission.type !== type && input.siteIds.includes(permission.siteId));
    if (toRetype.length > 0) {
      await ctx.db.permission.updateMany({ where: { id: { in: toRetype.map((permission) => permission.id) } }, data: { type } });
    }

    await audit(ctx.db, ctx.organizationId, ctx.session.user.id, "user.sitePermissionsAdded", user.id, undefined, {
      type,
      sites: sites.map((site) => ({ id: site.id, name: site.name })),
    });

    return { added: toCreate.length + toRetype.length };
  }),

  /** Remove a single site permission. The UI confirms first. */
  removeSitePermission: siteAdminProcedure.input(removeSitePermissionInputSchema).mutation(async ({ ctx, input }) => {
    const { user } = await loadManagedUser(ctx, input.userId);
    if (!(await canAssignSitePermission(ctx, input.siteId))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You don't manage this site, so you can't remove it." });
    }
    const permission = user.permissions.find((row) => row.siteId === input.siteId);
    if (!permission) throw new TRPCError({ code: "NOT_FOUND", message: "That permission has already been removed." });

    await ctx.db.permission.delete({ where: { id: permission.id } });
    await audit(ctx.db, ctx.organizationId, ctx.session.user.id, "user.sitePermissionRemoved", user.id, { siteId: permission.siteId, siteName: permission.site.name, type: permission.type }, undefined);
    return { removed: 1 };
  }),

  /**
   * Edit Users → Remove Users. Soft removal: isActive = false, so the user can
   * no longer sign in or act (orgProcedure re-checks per call) while bookings,
   * audit history and permission rows stay intact. Never removes the actor.
   */
  deactivateMany: siteAdminProcedure.input(deactivateUsersInputSchema).mutation(async ({ ctx, input }) => {
    const ids = [...new Set(input.userIds)];
    if (ids.includes(ctx.session.user.id)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove your own account." });
    }
    const managed = await getManagedSiteIds(ctx);
    const targets = await ctx.db.user.findMany({ where: { id: { in: ids } }, include: { permissions: { select: { siteId: true, type: true } } } });
    if (targets.length !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "One of the selected users no longer exists." });
    const refused = targets.filter((target) => !canManageUser(ctx.session, target, managed));
    if (refused.length > 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: `You don't have permission to remove ${refused.map((target) => target.name).join(", ")}.` });
    }

    const result = await ctx.db.user.updateMany({ where: { id: { in: ids }, isActive: true }, data: { isActive: false } });
    for (const target of targets) {
      await audit(ctx.db, ctx.organizationId, ctx.session.user.id, "user.deactivated", target.id, { isActive: target.isActive }, { isActive: false });
    }
    return { deactivated: result.count };
  }),

  /** Undo a removal. */
  reactivate: siteAdminProcedure.input(z.object({ userId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const { user } = await loadManagedUser(ctx, input.userId);
    if (user.isActive) return { reactivated: false };
    await ctx.db.user.update({ where: { id: user.id }, data: { isActive: true } });
    await audit(ctx.db, ctx.organizationId, ctx.session.user.id, "user.reactivated", user.id, { isActive: false }, { isActive: true });
    return { reactivated: true };
  }),
});
