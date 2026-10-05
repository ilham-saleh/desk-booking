import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { scopedDb } from "@/server/db/tenant-scope";

/**
 * Exercises the tenant-scoping client (src/server/db/tenant-scope.ts) against a
 * real Postgres database — CLAUDE.md rule 1 requires isolation to be covered by
 * automated tests. Run against DATABASE_URL_TEST (see .env.example), never
 * dev/prod: migrations must already be applied there, e.g.
 *   DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

let orgA: { id: string };
let orgB: { id: string };
let siteA: { id: string };
let siteB: { id: string };

describe("tenant isolation", () => {
  beforeAll(async () => {
    await db.site.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany({ where: { slug: { in: ["tenant-test-a", "tenant-test-b"] } } });

    orgA = await db.organization.create({
      data: { name: "Tenant Test A", slug: "tenant-test-a" },
    });
    orgB = await db.organization.create({
      data: { name: "Tenant Test B", slug: "tenant-test-b" },
    });

    siteA = await db.site.create({ data: { organizationId: orgA.id, name: "Site A", timeZone: "UTC" } });
    siteB = await db.site.create({ data: { organizationId: orgB.id, name: "Site B", timeZone: "UTC" } });
  });

  afterAll(async () => {
    await db.site.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await db.$disconnect();
  });

  it("reads only return rows belonging to the scoped organization", async () => {
    const scopedToA = scopedDb(db, orgA.id);
    const sites = await scopedToA.site.findMany();
    expect(sites.map((s) => s.id)).toEqual([siteA.id]);
  });

  it("findUnique cannot fetch another organization's row by id", async () => {
    const scopedToA = scopedDb(db, orgA.id);
    const found = await scopedToA.site.findUnique({ where: { id: siteB.id } });
    expect(found).toBeNull();
  });

  it("create scopes to the calling organization when the value matches", async () => {
    const scopedToA = scopedDb(db, orgA.id);
    const created = await scopedToA.site.create({
      data: { organizationId: orgA.id, name: "New Site A2", timeZone: "UTC" },
    });
    expect(created.organizationId).toBe(orgA.id);
  });

  it("create rejects an explicit organizationId for a different organization", async () => {
    const scopedToA = scopedDb(db, orgA.id);
    await expect(
      scopedToA.site.create({
        data: { organizationId: orgB.id, name: "Sneaky Site", timeZone: "UTC" },
      }),
    ).rejects.toThrow(/Tenant scope violation/);
  });

  it("updateMany/deleteMany cannot affect another organization's row", async () => {
    const scopedToA = scopedDb(db, orgA.id);

    const updateResult = await scopedToA.site.updateMany({
      where: { id: siteB.id },
      data: { name: "Hacked" },
    });
    expect(updateResult.count).toBe(0);

    const deleteResult = await scopedToA.site.deleteMany({ where: { id: siteB.id } });
    expect(deleteResult.count).toBe(0);

    const stillThere = await db.site.findUnique({ where: { id: siteB.id } });
    expect(stillThere?.name).toBe("Site B");
  });
});
