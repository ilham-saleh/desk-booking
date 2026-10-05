import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";

/**
 * Regression coverage for booking.listMine's "upcoming"/"past" split. It
 * used to key off `status` AND `startAt`, which meant a booking currently in
 * progress (startAt in the past, still active) fell through both tabs, and
 * a booking cancelled ahead of a future start date fell through both tabs
 * too (see src/server/api/routers/booking.ts for the fix).
 *
 * Run against DATABASE_URL_TEST — migrations must already be applied there.
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

function nextWeekday(from: Date): string {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type SessionUser = { id: string; name: string; email: string; role: Role; organizationId: string | null };

function callerFor(user: SessionUser) {
  return appRouter.createCaller({ db, headers: new Headers(), session: { user } });
}

let org: { id: string };
let site: { id: string };
let floor: { id: string };
let user: SessionUser;

describe("booking.listMine", () => {
  beforeAll(async () => {
    await db.organization.deleteMany({ where: { slug: "list-mine-test" } });

    org = await db.organization.create({ data: { name: "List Mine Test", slug: "list-mine-test" } });
    site = await db.site.create({
      data: { organizationId: org.id, name: "Site", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1080 },
    });
    floor = await db.floor.create({ data: { organizationId: org.id, siteId: site.id, name: "Floor", sortOrder: 0 } });

    const userRow = await db.user.create({
      data: { organizationId: org.id, email: "standard@list-mine.test", name: "Standard User", role: Role.STANDARD_USER },
    });
    user = { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role, organizationId: org.id };
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { organizationId: org.id } });
    await db.booking.deleteMany({ where: { organizationId: org.id } });
    await db.desk.deleteMany({ where: { organizationId: org.id } });
    await db.floor.deleteMany({ where: { organizationId: org.id } });
    await db.site.deleteMany({ where: { organizationId: org.id } });
    await db.user.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
  });

  it("shows a booking that's in progress right now under 'upcoming', not 'past'", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "P1", x: 0, y: 0 } });
    const booking = await db.booking.create({
      data: {
        organizationId: org.id,
        deskId: desk.id,
        userId: user.id,
        bookedById: user.id,
        date: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
        startAt: new Date(Date.now() - 30 * 60_000),
        endAt: new Date(Date.now() + 30 * 60_000),
        status: "CONFIRMED",
      },
    });

    const upcoming = await callerFor(user).booking.listMine({ when: "upcoming" });
    expect(upcoming.map((b) => b.id)).toContain(booking.id);

    const past = await callerFor(user).booking.listMine({ when: "past" });
    expect(past.map((b) => b.id)).not.toContain(booking.id);
  });

  it("shows a booking cancelled ahead of its future start date under 'past', not 'upcoming'", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "P2", x: 1, y: 1 } });
    const booking = await callerFor(user).booking.create({
      deskId: desk.id,
      date: nextWeekday(new Date()),
      startMinutes: 540,
      endMinutes: 600,
    });
    await callerFor(user).booking.cancel({ bookingId: booking.id });

    const past = await callerFor(user).booking.listMine({ when: "past" });
    expect(past.map((b) => b.id)).toContain(booking.id);

    const upcoming = await callerFor(user).booking.listMine({ when: "upcoming" });
    expect(upcoming.map((b) => b.id)).not.toContain(booking.id);
  });
});
