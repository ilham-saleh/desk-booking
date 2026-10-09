import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { runCheckInAutoCancelSweep } from "@/server/booking/auto-cancel";

/**
 * Exercises runCheckInAutoCancelSweep (CLAUDE.md rule 6 / spec section C:
 * not checked in within an hour after start -> auto-cancel + release the desk)
 * directly against a real Postgres database. Run against DATABASE_URL_TEST
 * — migrations must already be applied there.
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

async function makeOrg(slug: string, name: string) {
  await db.organization.deleteMany({ where: { slug } });
  const org = await db.organization.create({ data: { name, slug } });
  const site = await db.site.create({
    data: { organizationId: org.id, name: "Site", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1080 },
  });
  const floor = await db.floor.create({ data: { organizationId: org.id, siteId: site.id, name: "Floor", sortOrder: 0 } });
  const user = await db.user.create({ data: { organizationId: org.id, email: `standard@${slug}.test`, name: "Standard User", role: "STANDARD_USER" } });
  return { org, site, floor, user };
}

let userCounter = 0;

/** A fresh user per booking — these tests create overlapping-in-wall-clock-time
 * fixtures across cases, and rule 4's exclusion constraint is per-user. */
async function makeUser(organizationId: string) {
  userCounter++;
  const user = await db.user.create({
    data: { organizationId, email: `sweep-user-${userCounter}@auto-cancel.test`, name: `Sweep User ${userCounter}`, role: "STANDARD_USER" },
  });
  return user;
}

async function makeBooking(opts: {
  organizationId: string;
  deskId: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  status?: "CONFIRMED" | "CHECKED_IN";
  checkedInAt?: Date;
  /** Defaults to well before the start, as for a booking made in advance. */
  createdAt?: Date;
}) {
  return db.booking.create({
    data: {
      organizationId: opts.organizationId,
      deskId: opts.deskId,
      userId: opts.userId,
      bookedById: opts.userId,
      date: new Date(opts.startAt.toISOString().slice(0, 10) + "T00:00:00Z"),
      startAt: opts.startAt,
      endAt: opts.endAt,
      status: opts.status ?? "CONFIRMED",
      checkedInAt: opts.checkedInAt ?? null,
      createdAt: opts.createdAt ?? new Date(opts.startAt.getTime() - 24 * 60 * 60_000),
    },
  });
}

let orgA: Awaited<ReturnType<typeof makeOrg>>;
let orgB: Awaited<ReturnType<typeof makeOrg>>;

describe("runCheckInAutoCancelSweep", () => {
  beforeAll(async () => {
    orgA = await makeOrg("auto-cancel-test-a", "Auto Cancel Test A");
    orgB = await makeOrg("auto-cancel-test-b", "Auto Cancel Test B");
  });

  afterAll(async () => {
    for (const { org } of [orgA, orgB]) {
      await db.notification.deleteMany({ where: { organizationId: org.id } });
      await db.auditLog.deleteMany({ where: { organizationId: org.id } });
      await db.booking.deleteMany({ where: { organizationId: org.id } });
      await db.desk.deleteMany({ where: { organizationId: org.id } });
      await db.floor.deleteMany({ where: { organizationId: org.id } });
      await db.site.deleteMany({ where: { organizationId: org.id } });
      await db.user.deleteMany({ where: { organizationId: org.id } });
      await db.organization.delete({ where: { id: org.id } });
    }
    await db.$disconnect();
  });

  it("auto-cancels a CONFIRMED booking past its check-in deadline on a requiresCheckIn desk, and notifies", async () => {
    const desk = await db.desk.create({ data: { organizationId: orgA.org.id, floorId: orgA.floor.id, number: "S1", x: 0, y: 0, requiresCheckIn: true } });
    const user = await makeUser(orgA.org.id);
    const booking = await makeBooking({
      organizationId: orgA.org.id,
      deskId: desk.id,
      userId: user.id,
      startAt: new Date(Date.now() - 61 * 60_000), // started 61 min ago — past the one-hour deadline
      endAt: new Date(Date.now() + 60 * 60_000),
    });

    await runCheckInAutoCancelSweep(db);

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe("AUTO_CANCELLED");
    expect(updated.cancelledById).toBeNull();

    const audit = await db.auditLog.findFirst({ where: { targetId: booking.id, action: "booking.autoCancel" } });
    expect(audit).not.toBeNull();
    expect(audit?.organizationId).toBe(orgA.org.id);

    const notification = await db.notification.findFirst({ where: { userId: user.id, type: "booking.autoCancelled" } });
    expect(notification).not.toBeNull();
  });

  it("leaves alone a booking still inside its first hour", async () => {
    const desk = await db.desk.create({ data: { organizationId: orgA.org.id, floorId: orgA.floor.id, number: "S2", x: 1, y: 1, requiresCheckIn: true } });
    const user = await makeUser(orgA.org.id);
    const booking = await makeBooking({
      organizationId: orgA.org.id,
      deskId: desk.id,
      userId: user.id,
      startAt: new Date(Date.now() - 45 * 60_000), // started 45 min ago — 15 min left to check in
      endAt: new Date(Date.now() + 2 * 60 * 60_000),
    });
    const upcoming = await makeBooking({
      organizationId: orgA.org.id,
      deskId: desk.id,
      userId: (await makeUser(orgA.org.id)).id,
      startAt: new Date(Date.now() + 3 * 60 * 60_000),
      endAt: new Date(Date.now() + 4 * 60 * 60_000),
    });

    await runCheckInAutoCancelSweep(db);

    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");
    expect((await db.booking.findUniqueOrThrow({ where: { id: upcoming.id } })).status).toBe("CONFIRMED");
  });

  it("gives a booking made after its start a full hour from when it was made", async () => {
    const desk = await db.desk.create({ data: { organizationId: orgA.org.id, floorId: orgA.floor.id, number: "S6", x: 4, y: 4, requiresCheckIn: true } });
    const user = await makeUser(orgA.org.id);
    const booking = await makeBooking({
      organizationId: orgA.org.id,
      deskId: desk.id,
      userId: user.id,
      startAt: new Date(Date.now() - 70 * 60_000), // the slot started 70 min ago…
      endAt: new Date(Date.now() + 60 * 60_000),
      createdAt: new Date(Date.now() - 10 * 60_000), // …but it was only booked 10 min ago
    });

    await runCheckInAutoCancelSweep(db);

    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");
  });

  it("leaves alone a booking that's already checked in", async () => {
    const desk = await db.desk.create({ data: { organizationId: orgA.org.id, floorId: orgA.floor.id, number: "S3", x: 2, y: 2, requiresCheckIn: true } });
    const user = await makeUser(orgA.org.id);
    const booking = await makeBooking({
      organizationId: orgA.org.id,
      deskId: desk.id,
      userId: user.id,
      startAt: new Date(Date.now() - 10 * 60_000),
      endAt: new Date(Date.now() + 50 * 60_000),
      status: "CHECKED_IN",
      checkedInAt: new Date(),
    });

    await runCheckInAutoCancelSweep(db);

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe("CHECKED_IN");
  });

  it("leaves alone a stale booking on a desk that doesn't require check-in", async () => {
    const desk = await db.desk.create({ data: { organizationId: orgA.org.id, floorId: orgA.floor.id, number: "S4", x: 3, y: 3, requiresCheckIn: false } });
    const user = await makeUser(orgA.org.id);
    const booking = await makeBooking({
      organizationId: orgA.org.id,
      deskId: desk.id,
      userId: user.id,
      startAt: new Date(Date.now() - 2 * 60 * 60_000),
      endAt: new Date(Date.now() + 60 * 60_000),
    });

    await runCheckInAutoCancelSweep(db);

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe("CONFIRMED");
  });

  it("scopes audit/notification writes to the booking's own organization (tenant isolation)", async () => {
    const desk = await db.desk.create({ data: { organizationId: orgB.org.id, floorId: orgB.floor.id, number: "S5", x: 0, y: 0, requiresCheckIn: true } });
    const user = await makeUser(orgB.org.id);
    const booking = await makeBooking({
      organizationId: orgB.org.id,
      deskId: desk.id,
      userId: user.id,
      startAt: new Date(Date.now() - 65 * 60_000),
      endAt: new Date(Date.now() + 30 * 60_000),
    });

    await runCheckInAutoCancelSweep(db);

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updated.status).toBe("AUTO_CANCELLED");

    const audit = await db.auditLog.findFirst({ where: { targetId: booking.id, action: "booking.autoCancel" } });
    expect(audit?.organizationId).toBe(orgB.org.id);

    const crossTenantAudit = await db.auditLog.findFirst({ where: { targetId: booking.id, organizationId: orgA.org.id } });
    expect(crossTenantAudit).toBeNull();
  });
});
