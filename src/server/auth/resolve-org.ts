import "server-only";

import { Prisma, type PrismaClient, type User } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import type { EntraProfile } from "@/server/auth/entra-profile";

export interface ResolvedIdentity {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string | null;
}

function toIdentity(user: Pick<User, "id" | "name" | "email" | "role" | "organizationId">): ResolvedIdentity {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Finds the user an Entra identity belongs to: by object ID first, then by
 * email for rows that have never signed in with Entra. A row already bound to
 * a *different* object ID is a conflict, never a match — otherwise a reused
 * mailbox could take over someone else's account.
 */
async function matchUser(
  client: PrismaClient,
  scope: Prisma.UserWhereInput,
  profile: EntraProfile,
): Promise<User | "conflict" | null> {
  const byObjectId = await client.user.findFirst({ where: { ...scope, entraObjectId: profile.objectId } });
  if (byObjectId) return byObjectId;

  const byEmail = await client.user.findFirst({ where: { ...scope, email: profile.email } });
  if (byEmail?.entraObjectId && byEmail.entraObjectId !== profile.objectId) return "conflict";
  return byEmail;
}

/** Entra-owned fields to write. `undefined` (unknown) fields are left out so the stored value stays. */
function entraOwnedFields(profile: EntraProfile) {
  const fields = {
    firstName: profile.firstName,
    lastName: profile.lastName,
    title: profile.title,
    department: profile.department,
    location: profile.location,
    phone: profile.phone,
    employeeId: profile.employeeId,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<
    Record<keyof typeof fields, string | null>
  >;
}

function displayName(profile: EntraProfile): string | undefined {
  return profile.name ?? ([profile.firstName, profile.lastName].filter(Boolean).join(" ") || undefined);
}

/** True when another user in the org already holds `value` in a unique column. */
async function takenByOther(
  client: PrismaClient,
  organizationId: string,
  userId: string | null,
  field: "email" | "employeeId",
  value: string,
): Promise<boolean> {
  const other = await client.user.findFirst({
    where: { organizationId, [field]: value, ...(userId ? { id: { not: userId } } : {}) },
    select: { id: true },
  });
  return other !== null;
}

/**
 * Refreshes Entra-owned fields on an existing org user. App-owned fields
 * (role, isActive, timezone, permissions) are never part of this write.
 */
async function refreshUser(client: PrismaClient, user: User, profile: EntraProfile): Promise<User> {
  const organizationId = user.organizationId!;
  const fields = entraOwnedFields(profile);

  if (fields.employeeId && (await takenByOther(client, organizationId, user.id, "employeeId", fields.employeeId))) {
    console.warn("Entra employeeId already used by another user; not stored", { userId: user.id });
    delete fields.employeeId;
  }

  let email: string | undefined;
  if (profile.email !== user.email) {
    if (await takenByOther(client, organizationId, user.id, "email", profile.email)) {
      console.warn("Entra email already used by another user; keeping the stored email", { userId: user.id });
    } else {
      email = profile.email;
    }
  }

  return client.user.update({
    where: { id: user.id },
    data: {
      ...fields,
      entraObjectId: profile.objectId,
      name: displayName(profile) ?? user.name,
      ...(email ? { email } : {}),
      lastLoginAt: new Date(),
    },
  });
}

/** First sign-in ("sign-up"): a Standard User with no site permissions. */
async function provisionUser(client: PrismaClient, organizationId: string, profile: EntraProfile): Promise<User> {
  const fields = entraOwnedFields(profile);
  if (fields.employeeId && (await takenByOther(client, organizationId, null, "employeeId", fields.employeeId))) {
    console.warn("Entra employeeId already used by another user; not stored", { organizationId });
    delete fields.employeeId;
  }

  return client.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        ...fields,
        organizationId,
        entraObjectId: profile.objectId,
        email: profile.email,
        name: displayName(profile) ?? profile.email,
        role: Role.STANDARD_USER,
        isActive: true,
        lastLoginAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: user.id,
        action: "user.provisioned",
        targetType: "User",
        targetId: user.id,
        after: { email: user.email, name: user.name, role: user.role, source: "entra" },
      },
    });
    return user;
  });
}

/**
 * Resolves a Microsoft Entra sign-in — the only sign-in/sign-up method
 * (PROJECT_SPECS.md §5). The org is chosen by the token's tenant ID; a first
 * sign-in creates the user as a Standard User, later ones refresh their
 * Entra-owned profile. Inactive users and unknown tenants are rejected, and a
 * sign-in never reactivates anyone. Platform Admins belong to no org and are
 * never auto-created.
 */
export async function resolveEntraSignIn(profile: EntraProfile, client: PrismaClient = db): Promise<ResolvedIdentity | null> {
  const platformAdmin = await matchUser(client, { organizationId: null, role: Role.PLATFORM_ADMIN }, profile);
  if (platformAdmin === "conflict") {
    console.warn("Entra sign-in rejected: platform admin email bound to another Entra identity");
    return null;
  }
  if (platformAdmin) {
    if (!platformAdmin.isActive) return null;
    const updated = await client.user.update({
      where: { id: platformAdmin.id },
      data: { entraObjectId: profile.objectId, lastLoginAt: new Date() },
    });
    return toIdentity(updated);
  }

  const org = await client.organization.findFirst({
    where: { ssoEntraTenantId: profile.tenantId },
    select: { id: true, ssoEntraIssuer: true },
  });
  if (!org) {
    console.warn("Entra sign-in rejected: tenant is not configured for any organization", { tenantId: profile.tenantId });
    return null;
  }
  if (org.ssoEntraIssuer && org.ssoEntraIssuer !== profile.issuer) {
    console.warn("Entra sign-in rejected: issuer mismatch", { organizationId: org.id });
    return null;
  }

  const scope = { organizationId: org.id };
  const existing = await matchUser(client, scope, profile);
  if (existing === "conflict") {
    console.warn("Entra sign-in rejected: email already bound to another Entra identity", { organizationId: org.id });
    return null;
  }
  if (existing) {
    if (!existing.isActive) return null;
    return toIdentity(await refreshUser(client, existing, profile));
  }

  try {
    return toIdentity(await provisionUser(client, org.id, profile));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // A concurrent first sign-in won the insert — use the row it created.
    const winner = await matchUser(client, scope, profile);
    if (winner && winner !== "conflict" && winner.isActive) return toIdentity(await refreshUser(client, winner, profile));
    console.warn("Entra sign-in rejected: could not provision user", { organizationId: org.id });
    return null;
  }
}

/** Dev-only sign-in shortcut: any seeded user, across any org (or the platform), by email alone. */
export async function resolveDevCredentials(rawEmail: string): Promise<ResolvedIdentity | null> {
  const email = rawEmail.toLowerCase();
  const user = await db.user.findFirst({ where: { email, isActive: true } });
  if (!user) return null;

  // Record it for the Users page's Last Activity column without blocking the sign-in.
  void db.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() }, select: { id: true } })
    .catch((error: unknown) => console.error("Failed to record last login", { userId: user.id, error }));
  return toIdentity(user);
}
