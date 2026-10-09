import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";
import { storage } from "@/server/storage";

/**
 * Per-floor-plan desk-marker size (floor.setMarkerSize) against DATABASE_URL_TEST:
 * authorization, bounds, persistence on the draft, the live version following
 * while it shows the same image, and the size carrying into the next draft.
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

type SessionUser = { id: string; name: string; email: string; role: Role; organizationId: string | null };
const callerFor = (user: SessionUser) => appRouter.createCaller({ db, headers: new Headers(), session: { user } });

const SLUG = "marker-size-test";
const WIDTH = 1584;
const HEIGHT = 1224;
/** A valid 1×1 PNG. */
const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const uploadedKeys: string[] = [];

let floorA: { id: string };
let floorNoPlan: { id: string };
let facilityAdminA: SessionUser;
let facilityAdminB: SessionUser;
let employee: SessionUser;

async function cleanup() {
  const org = await db.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await db.auditLog.deleteMany({ where: { organizationId: org.id } });
  await db.floor.updateMany({ where: { organizationId: org.id }, data: { livePlanVersionId: null } });
  await db.floorPlanVersion.deleteMany({ where: { organizationId: org.id } });
  await db.permission.deleteMany({ where: { organizationId: org.id } });
  await db.floor.deleteMany({ where: { organizationId: org.id } });
  await db.site.deleteMany({ where: { organizationId: org.id } });
  await db.user.deleteMany({ where: { organizationId: org.id } });
  await db.organization.delete({ where: { id: org.id } });
}

async function plans(floorId: string) {
  const floor = await db.floor.findUniqueOrThrow({ where: { id: floorId }, include: { livePlanVersion: true } });
  const draft = await db.floorPlanVersion.findFirst({ where: { floorId, status: "DRAFT" } });
  return { live: floor.livePlanVersion, draft };
}

describe("floor plan marker size", () => {
  beforeAll(async () => {
    await cleanup();
    const org = await db.organization.create({ data: { name: "Marker Size", slug: SLUG } });
    const site = (name: string) =>
      db.site.create({ data: { organizationId: org.id, name, timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1140 } });
    const siteA = await site("London");
    const siteB = await site("Leeds");
    floorA = await db.floor.create({ data: { organizationId: org.id, siteId: siteA.id, name: "Level 5" } });
    floorNoPlan = await db.floor.create({ data: { organizationId: org.id, siteId: siteA.id, name: "Level 6" } });

    const mk = async (email: string, role: Role) => {
      const row = await db.user.create({ data: { organizationId: org.id, email, name: email, role } });
      return { id: row.id, name: row.name, email: row.email, role: row.role, organizationId: org.id } satisfies SessionUser;
    };
    facilityAdminA = await mk("fa-a@marker.test", Role.SITE_ADMIN);
    facilityAdminB = await mk("fa-b@marker.test", Role.SITE_ADMIN);
    employee = await mk("emp@marker.test", Role.STANDARD_USER);
    await db.permission.create({ data: { organizationId: org.id, userId: facilityAdminA.id, siteId: siteA.id, type: "FACILITY_ADMIN" } });
    await db.permission.create({ data: { organizationId: org.id, userId: facilityAdminB.id, siteId: siteB.id, type: "FACILITY_ADMIN" } });

    const version = (status: "LIVE" | "DRAFT", key: string) =>
      db.floorPlanVersion.create({
        data: {
          organizationId: org.id,
          floorId: floorA.id,
          status,
          sourceFileKey: key,
          renderedImageKey: key,
          imageWidth: WIDTH,
          imageHeight: HEIGHT,
          createdById: facilityAdminA.id,
        },
      });
    const live = await version("LIVE", "plans/level-5-v1.png");
    await db.floor.update({ where: { id: floorA.id }, data: { livePlanVersionId: live.id } });
    await version("DRAFT", "plans/level-5-v1.png");
  });

  afterAll(async () => {
    for (const key of uploadedKeys) await storage.deleteObject(key);
    await cleanup();
    await db.$disconnect();
  });

  it("refuses employees and facility admins of other sites", async () => {
    await expect(callerFor(employee).floor.setMarkerSize({ floorId: floorA.id, markerSize: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(facilityAdminB).floor.setMarkerSize({ floorId: floorA.id, markerSize: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await plans(floorA.id)).draft?.markerSize).toBeNull();
  });

  it("saves the size on the draft and the live plan showing the same image", async () => {
    await callerFor(facilityAdminA).floor.setMarkerSize({ floorId: floorA.id, markerSize: 28 });
    const { live, draft } = await plans(floorA.id);
    expect(draft?.markerSize).toBe(28);
    expect(live?.markerSize).toBe(28);

    // What the employee Floor Map loads.
    const floor = await callerFor(employee).floor.get({ floorId: floorA.id });
    expect(floor.livePlanVersion?.markerSize).toBe(28);
  });

  it("rejects sizes outside the plan's bounds", async () => {
    const admin = callerFor(facilityAdminA);
    await expect(admin.floor.setMarkerSize({ floorId: floorA.id, markerSize: 2 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(admin.floor.setMarkerSize({ floorId: floorA.id, markerSize: 400 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await plans(floorA.id)).draft?.markerSize).toBe(28);
  });

  it("clears back to automatic sizing", async () => {
    await callerFor(facilityAdminA).floor.setMarkerSize({ floorId: floorA.id, markerSize: null });
    const { live, draft } = await plans(floorA.id);
    expect(draft?.markerSize).toBeNull();
    expect(live?.markerSize).toBeNull();
  });

  it("leaves the live plan alone while the draft has a different image", async () => {
    const { draft } = await plans(floorA.id);
    await db.floorPlanVersion.update({ where: { id: draft!.id }, data: { renderedImageKey: "plans/level-5-v2.png" } });
    await callerFor(facilityAdminA).floor.setMarkerSize({ floorId: floorA.id, markerSize: 24 });
    const after = await plans(floorA.id);
    expect(after.draft?.markerSize).toBe(24);
    expect(after.live?.markerSize).toBeNull();
  });

  it("publishes the size and carries it into the next draft", async () => {
    const admin = callerFor(facilityAdminA);
    await admin.floor.publishFloorPlan({ floorId: floorA.id });
    expect((await plans(floorA.id)).live?.markerSize).toBe(24);
    const nextDraft = await admin.floor.getDraftFloorPlan({ floorId: floorA.id });
    expect(nextDraft.markerSize).toBe(24);
  });

  it("resets to automatic when a new image is uploaded", async () => {
    const admin = callerFor(facilityAdminA);
    expect((await plans(floorA.id)).draft?.markerSize).toBe(24);
    const updated = await admin.floor.uploadFloorPlan({ floorId: floorA.id, fileName: "level-5.png", fileData: [...TINY_PNG], mimeType: "image/png" });
    if (updated.renderedImageKey) uploadedKeys.push(updated.renderedImageKey);
    const after = await plans(floorA.id);
    expect(after.draft?.markerSize).toBeNull();
    // Live keeps its size until the new image is published.
    expect(after.live?.markerSize).toBe(24);
  });

  it("needs a floor plan image first", async () => {
    await expect(callerFor(facilityAdminA).floor.setMarkerSize({ floorId: floorNoPlan.id, markerSize: 20 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
