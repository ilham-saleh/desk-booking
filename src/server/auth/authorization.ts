import "server-only";

import { TRPCError } from "@trpc/server";

import { PermissionType, Role } from "@/generated/prisma/enums";
import { permissionTypeForRole } from "@/lib/roles";
import { isFacilityAdminRole, isOrgSuperAdmin, type Session } from "@/server/auth/roles";
import type { ScopedDb } from "@/server/tenancy";

/**
 * Reusable, server-side authorization helpers (CLAUDE.md §7, PROJECT_SPECS §49).
 * Every helper resolves scope from the database on each call — nothing cached
 * in the session is trusted for site scope. Import these from routers, page
 * loaders and domain services; do not scatter `role === ...` checks.
 */

export type AuthzCtx = { db: ScopedDb; session: Session };

type TargetUser = { id: string; role: Role; permissions: Array<{ siteId: string; type: PermissionType }> };

/** Sites the actor manages as a Facility Admin. `null` means "every site" (System Admin). */
export async function getManagedSiteIds(ctx: AuthzCtx): Promise<Set<string> | null> {
  if (isOrgSuperAdmin(ctx.session)) return null;
  if (!isFacilityAdminRole(ctx.session)) return new Set();
  const rows = await ctx.db.permission.findMany({
    where: { userId: ctx.session.user.id, type: PermissionType.FACILITY_ADMIN },
    select: { siteId: true },
  });
  return new Set(rows.map((row) => row.siteId));
}

/** System Admin: any site. Facility Admin: only a site they hold a FACILITY_ADMIN permission for. */
export async function canManageSite(ctx: AuthzCtx, siteId: string): Promise<boolean> {
  const managed = await getManagedSiteIds(ctx);
  return managed === null || managed.has(siteId);
}

/** Whether the actor may open the Users administration area at all. */
export function canManageUsers(session: Session): boolean {
  return isFacilityAdminRole(session);
}

/**
 * Who a Facility Admin may manage (policy for tasks/users-management.md §2):
 *  - never a System Admin, and never themselves (no self-promotion / self-granting);
 *  - only users whose every site permission lies inside the actor's managed sites
 *    (users with no site permissions count as in scope).
 * System Admins manage every user in the organization except that nobody may
 * change their own role or permissions through this area.
 */
export function canManageUser(session: Session, target: TargetUser, managedSiteIds: Set<string> | null): boolean {
  if (!canManageUsers(session)) return false;
  if (target.role === Role.PLATFORM_ADMIN) return false;
  if (managedSiteIds === null) return true;
  if (target.id === session.user.id) return false;
  if (target.role === Role.ORG_SUPER_ADMIN) return false;
  return target.permissions.every((permission) => managedSiteIds.has(permission.siteId));
}

/** Prisma filter matching exactly the users `canManageUser` admits for this actor. */
export function manageableUsersWhere(session: Session, managedSiteIds: Set<string> | null) {
  if (managedSiteIds === null) return { role: { not: Role.PLATFORM_ADMIN } };
  return {
    id: { not: session.user.id },
    role: { notIn: [Role.PLATFORM_ADMIN, Role.ORG_SUPER_ADMIN] },
    permissions: { none: { siteId: { notIn: [...managedSiteIds] } } },
  };
}

/** System Admin may assign any application role; Facility Admin anything but System Admin. */
export function canAssignRole(session: Session, role: Role): boolean {
  if (role === Role.PLATFORM_ADMIN) return false;
  if (isOrgSuperAdmin(session)) return true;
  if (isFacilityAdminRole(session)) return role !== Role.ORG_SUPER_ADMIN;
  return false;
}

/** Granting/revoking a site permission requires managing that site. */
export async function canAssignSitePermission(ctx: AuthzCtx, siteId: string): Promise<boolean> {
  return canManageSite(ctx, siteId);
}

/**
 * Booking on behalf of someone else (or a guest) at a site:
 *  - anyone for themselves;
 *  - System Admin anywhere;
 *  - Facility Admin at a site they manage;
 *  - Booking Manager at a site they hold a BOOK_FOR_OTHERS permission for.
 * Restriction checks elsewhere always use the occupant, never the actor.
 */
export async function canBookForUser(ctx: AuthzCtx, occupantUserId: string | null, siteId: string): Promise<boolean> {
  const actor = ctx.session.user;
  if (occupantUserId === actor.id) return true;
  if (isOrgSuperAdmin(ctx.session)) return true;

  const requiredType = permissionTypeForRole(actor.role);
  if (!requiredType) return false;

  const permission = await ctx.db.permission.findFirst({
    where: { userId: actor.id, siteId, type: requiredType },
    select: { id: true },
  });
  return permission !== null;
}

type BookingActors = { userId: string | null; bookedById: string };

/**
 * Who may cancel, end or check in a booking:
 *  - the occupant, or whoever made the booking on their behalf;
 *  - System Admin anywhere;
 *  - Facility Admin at the desk's site, when they manage it.
 * Standard users and Booking Managers never act on other people's bookings.
 */
export async function canManageBooking(ctx: AuthzCtx, booking: BookingActors, siteId: string): Promise<boolean> {
  const actorId = ctx.session.user.id;
  if (booking.userId === actorId || booking.bookedById === actorId) return true;
  if (!isFacilityAdminRole(ctx.session)) return false;
  return canManageSite(ctx, siteId);
}

export async function assertCanManageBooking(
  ctx: AuthzCtx,
  booking: BookingActors,
  siteId: string,
  action: "cancel" | "end" | "check in to",
): Promise<void> {
  if (await canManageBooking(ctx, booking, siteId)) return;
  if (isFacilityAdminRole(ctx.session)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You don't manage this site." });
  }
  throw new TRPCError({ code: "FORBIDDEN", message: `You can only ${action} your own bookings.` });
}

export async function assertCanBookForUser(ctx: AuthzCtx, occupantUserId: string | null, site: { id: string; name: string }): Promise<void> {
  if (await canBookForUser(ctx, occupantUserId, site.id)) return;
  const role = ctx.session.user.role;
  if (role === Role.STANDARD_USER) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can only book a desk for yourself." });
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `You don't have permission to book on behalf of others at ${site.name}.`,
  });
}
