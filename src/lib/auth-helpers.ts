/**
 * Authorization helpers — reusable permission checks for RBAC enforcement.
 * These are called from both pages (for UI redirect) and tRPC procedures
 * (for API authorization). Always assume scope needs to be re-verified
 * server-side on every mutation (CLAUDE.md rule 10).
 */

import { Role } from "@/generated/prisma/enums";
import type { Session } from "@/server/auth/roles";
import { isOrgSuperAdmin, isPlatformAdmin, isFacilityAdminRole, isBookingManagerRole } from "@/server/auth/roles";

/**
 * Can a user manage (create/edit/delete) a specific facility/site?
 * ORG_SUPER_ADMIN: always (within their org)
 * FACILITY_ADMIN: only if they have permission for that site
 */
export function canManageFacility(
  session: Session,
  options: { siteId: string; userPermissions?: Set<string> },
): boolean {
  if (!session.user.organizationId) return false;
  if (isOrgSuperAdmin(session)) return true;

  if (isFacilityAdminRole(session)) {
    // Must have explicit permission for this site
    return options.userPermissions?.has(options.siteId) ?? false;
  }

  return false;
}

/**
 * Can a user manage (edit/delete) a specific floor?
 * Same scope as managing its parent facility.
 */
export function canManageFloor(
  session: Session,
  options: { floorSiteId: string; userFacilityPermissions?: Set<string> },
): boolean {
  return canManageFacility(session, {
    siteId: options.floorSiteId,
    userPermissions: options.userFacilityPermissions,
  });
}

/**
 * Can a user edit (create/update/delete) a specific desk?
 * Must be able to manage the desk's parent floor's parent facility.
 */
export function canEditDesk(
  session: Session,
  options: { deskSiteId: string; userFacilityPermissions?: Set<string> },
): boolean {
  return canManageFacility(session, {
    siteId: options.deskSiteId,
    userPermissions: options.userFacilityPermissions,
  });
}

/**
 * Can a user manage (edit role/permissions/deactivate) another user?
 * ORG_SUPER_ADMIN: all users in their org
 * FACILITY_ADMIN: users with permissions for their assigned facilities
 */
export function canManageUser(
  session: Session,
  targetUserId: string,
  options: { targetUserFacilities?: Set<string>; userFacilityPermissions?: Set<string> },
): boolean {
  if (!session.user.organizationId) return false;
  if (isPlatformAdmin(session)) return false; // Platform admins don't manage org users
  if (isOrgSuperAdmin(session)) return true; // Org super admin manages all org users

  if (isFacilityAdminRole(session)) {
    // Facility admin can manage users assigned to their facilities
    // Check if there's overlap between user's facilities and target's facilities
    if (!options.targetUserFacilities || !options.userFacilityPermissions) return false;
    for (const facility of options.userFacilityPermissions) {
      if (options.targetUserFacilities.has(facility)) return true;
    }
  }

  return false;
}

/**
 * Can a user book on behalf of another user (occupant)?
 * BOOKING_MANAGER: yes (with optional scope constraints)
 * FACILITY_ADMIN / ORG_SUPER_ADMIN: yes
 * STANDARD_USER: no, can only book for themselves
 */
export function canBookForUser(session: Session, occupantUserId: string): boolean {
  if (!session.user.organizationId) return false;

  // User can always book for themselves
  if (session.user.id === occupantUserId) return true;

  // Booking managers and admins can book for others
  if (isBookingManagerRole(session) || isFacilityAdminRole(session) || isOrgSuperAdmin(session)) return true;

  return false;
}

/**
 * Can a user cancel a specific booking?
 * STANDARD_USER: only their own bookings, and only if not yet started
 * BOOKING_MANAGER: bookings of users they manage
 * FACILITY_ADMIN: bookings on desks in their facilities
 * ORG_SUPER_ADMIN: any booking in their org
 */
export function canCancelBooking(
  session: Session,
  options: {
    bookingOccupantId: string | null;
    bookingDeskSiteId: string;
    hasStarted?: boolean;
    userFacilityPermissions?: Set<string>;
  },
): boolean {
  if (!session.user.organizationId) return false;

  // Can never cancel a started booking (use end-early for that)
  if (options.hasStarted) return false;

  // Org super admin can cancel any booking
  if (isOrgSuperAdmin(session)) return true;

  // Standard user can only cancel their own bookings
  if (session.user.role === Role.STANDARD_USER) {
    return session.user.id === options.bookingOccupantId;
  }

  // Booking manager / facility admin can cancel bookings for desks in their scope
  if (isBookingManagerRole(session) || isFacilityAdminRole(session)) {
    return options.userFacilityPermissions?.has(options.bookingDeskSiteId) ?? false;
  }

  return false;
}

/**
 * Can a user access a specific facility/site?
 * Used to determine if a user should see/book from a facility's floors.
 * STANDARD_USER: only if assigned to that facility
 * BOOKING_MANAGER: only if assigned to that facility
 * FACILITY_ADMIN: only their assigned facilities
 * ORG_SUPER_ADMIN: all facilities in their org
 */
export function canAccessFacility(
  session: Session,
  siteId: string,
  userFacilityPermissions?: Set<string>,
): boolean {
  if (!session.user.organizationId) return false;

  if (isOrgSuperAdmin(session)) return true;

  // For all other roles, check explicit assignment
  return userFacilityPermissions?.has(siteId) ?? false;
}
