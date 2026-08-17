import { Role } from "@/generated/prisma/enums";

export interface Session {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    /** Null only for PLATFORM_ADMIN, who belongs to no organization. */
    organizationId: string | null;
  };
}

export function isPlatformAdmin(session: Session): boolean {
  return session.user.role === Role.PLATFORM_ADMIN;
}

export function isOrgSuperAdmin(session: Session): boolean {
  return session.user.role === Role.ORG_SUPER_ADMIN;
}

/** Site Admin or above (within an org) — display/nav concern only; site scope is always re-checked live. */
export function isSiteAdminRole(session: Session): boolean {
  return session.user.role === Role.SITE_ADMIN || session.user.role === Role.ORG_SUPER_ADMIN;
}
