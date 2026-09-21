import { PermissionType, Role } from "@/generated/prisma/enums";

/**
 * Product-facing role vocabulary (PROJECT_SPECS.md §7) over the stored enum.
 * The Prisma values predate the spec naming and are kept as-is to avoid a
 * risky enum migration: ORG_SUPER_ADMIN is the System Admin, SITE_ADMIN is
 * the Facility Admin. Client-safe — no server imports.
 */
export const ROLE_LABELS: Record<Role, string> = {
  [Role.PLATFORM_ADMIN]: "Platform Admin",
  [Role.ORG_SUPER_ADMIN]: "System Admin",
  [Role.SITE_ADMIN]: "Facility Admin",
  [Role.BOOKING_MANAGER]: "Booking Manager",
  [Role.STANDARD_USER]: "Standard User",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

/** The four application roles an admin may assign (PLATFORM_ADMIN is never assignable in-app). */
export const ASSIGNABLE_ROLES: Role[] = [Role.ORG_SUPER_ADMIN, Role.SITE_ADMIN, Role.BOOKING_MANAGER, Role.STANDARD_USER];

/** Roles that open the admin area (Users, Facilities, Editing Platform, Restrictions). */
export function isAdminRole(role: Role): boolean {
  return role === Role.SITE_ADMIN || role === Role.ORG_SUPER_ADMIN;
}

/** Roles whose booking UI offers "book for another user / a guest". Site scope is still enforced server-side. */
export function canBookForOthersRole(role: Role): boolean {
  return isAdminRole(role) || role === Role.BOOKING_MANAGER;
}

/** System Admins hold no Permission rows — the role itself grants every site and floor. */
export function roleGrantsAllSites(role: Role): boolean {
  return role === Role.ORG_SUPER_ADMIN;
}

/**
 * Which Permission rows a role can make use of. Rows of any other type are
 * inert for that role and are removed when the role changes (see
 * user.save), so a demoted Facility Admin never keeps hidden site access.
 */
export function permissionTypeForRole(role: Role): PermissionType | null {
  switch (role) {
    case Role.SITE_ADMIN:
      return PermissionType.FACILITY_ADMIN;
    case Role.BOOKING_MANAGER:
      return PermissionType.BOOK_FOR_OTHERS;
    default:
      return null;
  }
}

/** Rank used for "sort by role": broadest access first. */
export const ROLE_RANK: Record<Role, number> = {
  [Role.PLATFORM_ADMIN]: 0,
  [Role.ORG_SUPER_ADMIN]: 1,
  [Role.SITE_ADMIN]: 2,
  [Role.BOOKING_MANAGER]: 3,
  [Role.STANDARD_USER]: 4,
};

/**
 * Readable Permissions-column summary (tasks/users-management.md §29).
 * `siteNames` are the sites of the user's role-applicable Permission rows.
 */
export function permissionSummary(role: Role, siteNames: string[]): string {
  switch (role) {
    case Role.PLATFORM_ADMIN:
      return "Platform administration";
    case Role.ORG_SUPER_ADMIN:
      return "All sites and floors";
    case Role.SITE_ADMIN:
      return siteNames.length > 0 ? `Manages: ${siteNames.join(", ")}` : "No site assigned";
    case Role.BOOKING_MANAGER:
      return siteNames.length > 0 ? `Book for others: ${siteNames.join(", ")}` : "No booking permissions";
    case Role.STANDARD_USER:
      return "Standard booking access";
  }
}

export function displayName(user: { firstName?: string | null; lastName?: string | null; name: string }): string {
  const joined = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return joined.length > 0 ? joined : user.name;
}
