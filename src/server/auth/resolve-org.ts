import "server-only";

import { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export interface ResolvedIdentity {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string | null;
}

function toIdentity(user: {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string | null;
}): ResolvedIdentity {
  // Every resolver funnels a successful sign-in through here — record it for
  // the Users page's Last Activity column without blocking the sign-in.
  void db.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, select: { id: true } })
    .catch((error: unknown) => console.error("Failed to record last login", { userId: user.id, error }));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };
}

async function findPlatformAdmin(email: string): Promise<ResolvedIdentity | null> {
  const user = await db.user.findFirst({
    where: { organizationId: null, role: Role.PLATFORM_ADMIN, email, isActive: true },
  });
  return user ? toIdentity(user) : null;
}

async function findOrgUserByEmail(organizationId: string, email: string): Promise<ResolvedIdentity | null> {
  const user = await db.user.findFirst({
    where: { organizationId, email, isActive: true },
  });
  return user ? toIdentity(user) : null;
}

/**
 * Resolves a Google sign-in to an identity. SSO authenticates only — the
 * org's User table is the directory (CLAUDE.md rule 11): unknown emails are
 * rejected outright, never auto-provisioned.
 */
export async function resolveGoogleSignIn(rawEmail: string): Promise<ResolvedIdentity | null> {
  const email = rawEmail.toLowerCase();

  const platformAdmin = await findPlatformAdmin(email);
  if (platformAdmin) return platformAdmin;

  const domain = email.split("@")[1];
  if (!domain) return null;

  const org = await db.organization.findFirst({ where: { ssoGoogleDomains: { has: domain } } });
  if (!org) return null;

  return findOrgUserByEmail(org.id, email);
}

/** Same principle as {@link resolveGoogleSignIn}, resolving the org via the Entra tenant/issuer instead of email domain. */
export async function resolveEntraSignIn(
  rawEmail: string,
  tenantId: string | undefined,
  issuer: string | undefined,
): Promise<ResolvedIdentity | null> {
  const email = rawEmail.toLowerCase();

  const platformAdmin = await findPlatformAdmin(email);
  if (platformAdmin) return platformAdmin;

  if (!tenantId && !issuer) return null;

  const orgMatchers = [
    tenantId ? { ssoEntraTenantId: tenantId } : null,
    issuer ? { ssoEntraIssuer: issuer } : null,
  ].filter((matcher): matcher is NonNullable<typeof matcher> => matcher !== null);

  const org = await db.organization.findFirst({ where: { OR: orgMatchers } });
  if (!org) return null;

  return findOrgUserByEmail(org.id, email);
}

/** Dev-only sign-in shortcut: any seeded user, across any org (or the platform), by email alone. */
export async function resolveDevCredentials(rawEmail: string): Promise<ResolvedIdentity | null> {
  const email = rawEmail.toLowerCase();
  const user = await db.user.findFirst({ where: { email, isActive: true } });
  return user ? toIdentity(user) : null;
}
