import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PermissionType, PrismaClient, Role } from "@/generated/prisma/client";
import { toEntraProfile, type EntraProfile } from "@/server/auth/entra-profile";
import { resolveEntraSignIn } from "@/server/auth/resolve-org";

/**
 * Entra-only sign-in / sign-up (PROJECT_SPECS.md §5–6, CLAUDE.md §8–9, §36–37)
 * against DATABASE_URL_TEST:
 *  - first sign-in from the configured tenant creates exactly one STANDARD_USER
 *  - later sign-ins refresh Entra-owned fields and keep role/permissions
 *  - match by object ID first; a changed email updates, never duplicates
 *  - other tenants, issuer mismatches, inactive users and email takeovers are rejected
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

const SLUG = "entra-sign-in-test";
const ISSUER_SLUG = "entra-issuer-test";
const TENANT = "11111111-1111-4111-8111-111111111111";
const ISSUER_TENANT = "22222222-2222-4222-8222-222222222222";
const OTHER_TENANT = "33333333-3333-4333-8333-333333333333";
const PLATFORM_EMAIL = "platform@entra.test";

let org: { id: string };
let site: { id: string };

function profile(overrides: Partial<EntraProfile> = {}): EntraProfile {
  return {
    objectId: "oid-new-hire",
    tenantId: TENANT,
    issuer: `https://login.microsoftonline.com/${TENANT}/v2.0`,
    email: "new.hire@entra.test",
    name: "New Hire",
    firstName: "New",
    lastName: "Hire",
    title: "Analyst",
    department: "Technology",
    location: "London",
    phone: null,
    employeeId: "E-1001",
    ...overrides,
  };
}

async function cleanup() {
  for (const slug of [SLUG, ISSUER_SLUG]) {
    const existing = await db.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) continue;
    const where = { organizationId: existing.id };
    await db.auditLog.deleteMany({ where });
    await db.permission.deleteMany({ where });
    await db.site.deleteMany({ where });
    await db.user.deleteMany({ where });
    await db.organization.delete({ where: { id: existing.id } });
  }
  await db.user.deleteMany({ where: { organizationId: null, email: PLATFORM_EMAIL } });
}

describe("Entra sign-in and first-sign-in provisioning", () => {
  beforeAll(async () => {
    await cleanup();
    org = await db.organization.create({ data: { name: "Entra Test", slug: SLUG, ssoEntraTenantId: TENANT } });
    site = await db.site.create({ data: { organizationId: org.id, name: "London", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1140 } });
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("rejects a tenant that no organization is configured for, creating nothing", async () => {
    const before = await db.user.count({ where: { email: "new.hire@entra.test" } });
    expect(await resolveEntraSignIn(profile({ tenantId: OTHER_TENANT }), db)).toBeNull();
    expect(await db.user.count({ where: { email: "new.hire@entra.test" } })).toBe(before);
  });

  it("first sign-in creates one Standard User from the Entra profile, with no permissions, and audits it", async () => {
    const identity = await resolveEntraSignIn(profile(), db);
    expect(identity).toMatchObject({ email: "new.hire@entra.test", name: "New Hire", role: Role.STANDARD_USER, organizationId: org.id });

    const user = await db.user.findUniqueOrThrow({ where: { id: identity!.id }, include: { permissions: true } });
    expect(user).toMatchObject({
      entraObjectId: "oid-new-hire",
      firstName: "New",
      lastName: "Hire",
      title: "Analyst",
      department: "Technology",
      location: "London",
      employeeId: "E-1001",
      isActive: true,
    });
    expect(user.lastLoginAt).not.toBeNull();
    expect(user.permissions).toHaveLength(0);
    expect(await db.auditLog.count({ where: { targetId: user.id, action: "user.provisioned" } })).toBe(1);
  });

  it("later sign-ins refresh Entra-owned fields but keep the app-owned role, timezone and permissions", async () => {
    const user = await db.user.findFirstOrThrow({ where: { organizationId: org.id, entraObjectId: "oid-new-hire" } });
    await db.user.update({ where: { id: user.id }, data: { role: Role.SITE_ADMIN, timezone: "Europe/Paris" } });
    await db.permission.create({ data: { organizationId: org.id, userId: user.id, siteId: site.id, type: PermissionType.FACILITY_ADMIN } });

    const identity = await resolveEntraSignIn(profile({ title: "Senior Analyst", email: "renamed.hire@entra.test", name: "Renamed Hire" }), db);
    expect(identity?.id).toBe(user.id);
    expect(identity?.role).toBe(Role.SITE_ADMIN);

    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { permissions: true } });
    expect(fresh).toMatchObject({ title: "Senior Analyst", email: "renamed.hire@entra.test", name: "Renamed Hire", role: Role.SITE_ADMIN, timezone: "Europe/Paris" });
    expect(fresh.permissions.map((permission) => permission.type)).toEqual([PermissionType.FACILITY_ADMIN]);
    expect(await db.user.count({ where: { organizationId: org.id, entraObjectId: "oid-new-hire" } })).toBe(1);
  });

  it("keeps stored values Entra didn't report (Graph unavailable), but clears ones Entra reports as unset", async () => {
    await resolveEntraSignIn(profile({ email: "renamed.hire@entra.test", title: undefined, department: undefined, location: null }), db);
    const fresh = await db.user.findFirstOrThrow({ where: { organizationId: org.id, entraObjectId: "oid-new-hire" } });
    expect(fresh).toMatchObject({ title: "Senior Analyst", department: "Technology", location: null });
  });

  it("binds an existing (pre-Entra) user found by email instead of creating a duplicate", async () => {
    const seeded = await db.user.create({ data: { organizationId: org.id, email: "seeded@entra.test", name: "Seeded User", role: Role.BOOKING_MANAGER } });
    const identity = await resolveEntraSignIn(profile({ objectId: "oid-seeded", email: "seeded@entra.test", employeeId: null }), db);
    expect(identity?.id).toBe(seeded.id);
    expect(identity?.role).toBe(Role.BOOKING_MANAGER);
    expect((await db.user.findUniqueOrThrow({ where: { id: seeded.id } })).entraObjectId).toBe("oid-seeded");
  });

  it("rejects a different Entra identity presenting an email already bound to someone else", async () => {
    expect(await resolveEntraSignIn(profile({ objectId: "oid-impostor", email: "seeded@entra.test", employeeId: null }), db)).toBeNull();
    expect(await db.user.count({ where: { organizationId: org.id, email: "seeded@entra.test" } })).toBe(1);
  });

  it("rejects a deactivated user and never reactivates them", async () => {
    const user = await db.user.create({
      data: { organizationId: org.id, email: "leaver@entra.test", name: "Leaver", role: Role.STANDARD_USER, isActive: false, entraObjectId: "oid-leaver" },
    });
    expect(await resolveEntraSignIn(profile({ objectId: "oid-leaver", email: "leaver@entra.test", employeeId: null }), db)).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false);
    expect(await db.user.count({ where: { organizationId: org.id, email: "leaver@entra.test" } })).toBe(1);
  });

  it("rejects an issuer that doesn't match the organization's configured issuer", async () => {
    await db.organization.create({
      data: { name: "Issuer Test", slug: ISSUER_SLUG, ssoEntraTenantId: ISSUER_TENANT, ssoEntraIssuer: `https://login.microsoftonline.com/${ISSUER_TENANT}/v2.0` },
    });
    const sameTenantWrongIssuer = profile({ tenantId: ISSUER_TENANT, objectId: "oid-issuer", email: "issuer@entra.test", issuer: "https://evil.example/v2.0", employeeId: null });
    expect(await resolveEntraSignIn(sameTenantWrongIssuer, db)).toBeNull();
    const correct = await resolveEntraSignIn({ ...sameTenantWrongIssuer, issuer: `https://login.microsoftonline.com/${ISSUER_TENANT}/v2.0` }, db);
    expect(correct?.role).toBe(Role.STANDARD_USER);
  });

  it("concurrent first sign-ins for the same person create exactly one user", async () => {
    const first = profile({ objectId: "oid-race", email: "race@entra.test", employeeId: null });
    const results = await Promise.all([resolveEntraSignIn(first, db), resolveEntraSignIn(first, db), resolveEntraSignIn(first, db)]);
    const ids = new Set(results.map((identity) => identity?.id));
    expect(ids.size).toBe(1);
    expect(await db.user.count({ where: { organizationId: org.id, entraObjectId: "oid-race" } })).toBe(1);
  });

  it("does not store an Entra employee ID that another user already holds", async () => {
    const identity = await resolveEntraSignIn(profile({ objectId: "oid-dup-employee", email: "dup.employee@entra.test", employeeId: "E-1001" }), db);
    expect(identity).not.toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: identity!.id } })).employeeId).toBeNull();
  });

  it("Platform Admins are matched by email once, then bound to their Entra object ID; they are never auto-created", async () => {
    expect(await resolveEntraSignIn(profile({ tenantId: OTHER_TENANT, objectId: "oid-platform", email: PLATFORM_EMAIL }), db)).toBeNull();
    await db.user.create({ data: { organizationId: null, email: PLATFORM_EMAIL, name: "Platform", role: Role.PLATFORM_ADMIN } });

    const identity = await resolveEntraSignIn(profile({ tenantId: OTHER_TENANT, objectId: "oid-platform", email: PLATFORM_EMAIL }), db);
    expect(identity).toMatchObject({ role: Role.PLATFORM_ADMIN, organizationId: null });
    expect(await resolveEntraSignIn(profile({ tenantId: OTHER_TENANT, objectId: "oid-someone-else", email: PLATFORM_EMAIL }), db)).toBeNull();
  });
});

describe("toEntraProfile", () => {
  const claims = { oid: "oid-1", tid: TENANT, iss: "https://login.microsoftonline.com/x/v2.0", name: "Ada Lovelace", preferred_username: "Ada.Lovelace@Company.com" };

  it("requires object ID, tenant ID and an email", () => {
    expect(toEntraProfile({ ...claims, oid: undefined }, null)).toBeNull();
    expect(toEntraProfile({ ...claims, tid: undefined }, null)).toBeNull();
    expect(toEntraProfile({ oid: "oid-1", tid: TENANT }, null)).toBeNull();
  });

  it("falls back to preferred_username and lowercases the email", () => {
    expect(toEntraProfile(claims, null)?.email).toBe("ada.lovelace@company.com");
  });

  it("without Graph, directory attributes are unknown (undefined) so stored values are kept", () => {
    const result = toEntraProfile(claims, null)!;
    expect(result.department).toBeUndefined();
    expect(result.title).toBeUndefined();
    expect(result.name).toBe("Ada Lovelace");
  });

  it("with Graph, attributes come from the directory and unset ones are null", () => {
    const result = toEntraProfile(claims, { mail: "ada@company.com", jobTitle: "Engineer", department: null, givenName: "Ada", surname: "Lovelace", businessPhones: [] })!;
    expect(result).toMatchObject({ email: "ada@company.com", title: "Engineer", department: null, firstName: "Ada", lastName: "Lovelace", phone: null, location: null });
  });
});
