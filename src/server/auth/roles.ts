import { Role } from "@/generated/prisma/enums";

export interface Session {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    /** Site IDs this user administers. Always empty for STANDARD_USER; all sites implicitly for SUPER_ADMIN. */
    adminSiteIds: string[];
  };
}

export function isSiteAdmin(session: Session): boolean {
  return session.user.role === Role.SITE_ADMIN || session.user.role === Role.SUPER_ADMIN;
}

export function isSuperAdmin(session: Session): boolean {
  return session.user.role === Role.SUPER_ADMIN;
}

/** Site Admins are scoped to their assigned sites; Super Admins can act on any site. */
export function canAdministerSite(session: Session, siteId: string): boolean {
  if (session.user.role === Role.SUPER_ADMIN) return true;
  if (session.user.role === Role.SITE_ADMIN) return session.user.adminSiteIds.includes(siteId);
  return false;
}
