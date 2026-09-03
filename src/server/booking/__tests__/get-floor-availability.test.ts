import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";

/**
 * Regression coverage: getFloorAvailability's day-window query used to
 * build its `dayEnd` bound from zonedDateTimeToUtc(date, 24*60, tz), which
 * collapsed to the same instant as `dayStart` (see time.test.ts) — so a
 * same-day booking's startAt (always >= dayStart) never satisfied
 * `startAt < dayEnd`, and the booking silently never showed up here: every
 * desk always looked AVAILABLE with an empty `bookings` list, no matter
 * what was actually booked.
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
let futureWeekday: string;

describe("booking.getFloorAvailability", () => {
  beforeAll(async () => {
    await db.organization.deleteMany({ where: { slug: "get-floor-availability-test" } });

    org = await db.organization.create({ data: { name: "Get Floor Availability Test", slug: "get-floor-availability-test", ssoGoogleDomains: [] } });
    site = await db.site.create({
      data: { organizationId: org.id, name: "Site", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1080 },
    });
    floor = await db.floor.create({ data: { organizationId: org.id, siteId: site.id, name: "Floor", sortOrder: 0 } });

    const userRow = await db.user.create({
      data: { organizationId: org.id, email: "standard@get-floor-availability.test", name: "Standard User", role: Role.STANDARD_USER },
    });
    user = { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role, organizationId: org.id };

    futureWeekday = nextWeekday(new Date());
  });

  afterAll(async () => {
    await db.booking.deleteMany({ where: { organizationId: org.id } });
    await db.desk.deleteMany({ where: { organizationId: org.id } });
    await db.floor.deleteMany({ where: { organizationId: org.id } });
    await db.site.deleteMany({ where: { organizationId: org.id } });
    await db.user.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
  });

  it("includes a same-day booking in the desk's bookings list and reflects it in state", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "F1", x: 0, y: 0 } });
    const booking = await callerFor(user).booking.create({
      deskId: desk.id,
      date: futureWeekday,
      startMinutes: 600,
      endMinutes: 660,
    });

    const availability = await callerFor(user).booking.getFloorAvailability({ floorId: floor.id, date: futureWeekday });
    const deskAvailability = availability.desks.find((d) => d.deskId === desk.id);

    expect(deskAvailability).toBeDefined();
    expect(deskAvailability?.state).toBe("SCHEDULED");
    expect(deskAvailability?.bookings).toHaveLength(1);
    expect(deskAvailability?.bookings[0]?.id).toBe(booking.id);
    expect(deskAvailability?.bookings[0]?.occupantLabel).toBe(user.name);
  });

  it("includes a booking that starts right at the site's day boundary (00:00 local)", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "F2", x: 1, y: 1 } });
    const booking = await db.booking.create({
      data: {
        organizationId: org.id,
        deskId: desk.id,
        userId: user.id,
        bookedById: user.id,
        date: new Date(`${futureWeekday}T00:00:00Z`),
        startAt: new Date(`${futureWeekday}T00:00:00+01:00`),
        endAt: new Date(`${futureWeekday}T01:00:00+01:00`),
        status: "CONFIRMED",
      },
    });

    const availability = await callerFor(user).booking.getFloorAvailability({ floorId: floor.id, date: futureWeekday });
    const deskAvailability = availability.desks.find((d) => d.deskId === desk.id);
    expect(deskAvailability?.bookings.map((b) => b.id)).toContain(booking.id);
  });
});
