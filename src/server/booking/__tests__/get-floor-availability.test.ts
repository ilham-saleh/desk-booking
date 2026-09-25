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

/** Each test books the same date, and one user may not hold overlapping bookings — so every booker is a fresh user. */
async function newStandardUser(label: string): Promise<SessionUser> {
  const row = await db.user.create({
    data: { organizationId: org.id, email: `${label}@get-floor-availability.test`, name: `User ${label}`, role: Role.STANDARD_USER },
  });
  return { id: row.id, name: row.name, email: row.email, role: row.role, organizationId: org.id };
}

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
    await db.permission.deleteMany({ where: { organizationId: org.id } });
    await db.desk.deleteMany({ where: { organizationId: org.id } });
    await db.floor.deleteMany({ where: { organizationId: org.id } });
    await db.site.deleteMany({ where: { organizationId: org.id } });
    await db.user.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
  });

  it("includes a same-day booking in the desk's bookings list and marks the desk BOOKED for the whole-day window", async () => {
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
    expect(deskAvailability?.state).toBe("BOOKED");
    expect(deskAvailability?.bookings).toHaveLength(1);
    expect(deskAvailability?.bookings[0]?.id).toBe(booking.id);
    expect(deskAvailability?.bookings[0]?.occupantLabel).toBe(user.name);
    expect(deskAvailability?.bookings[0]?.isOwn).toBe(true);
    expect(deskAvailability?.bookings[0]?.canManage).toBe(true);
    expect(deskAvailability?.bookings[0]?.occupant?.email).toBe(user.email);
  });

  it("only marks the desk BOOKED for a time window the booking actually overlaps", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "F3", x: 2, y: 2 } });
    const booker = await newStandardUser("f3-booker");
    // 09:00–18:00 booking
    await callerFor(booker).booking.create({ deskId: desk.id, date: futureWeekday, startMinutes: 540, endMinutes: 1080 });

    const during = await callerFor(user).booking.getFloorAvailability({
      floorId: floor.id,
      date: futureWeekday,
      startMinutes: 960,
      endMinutes: 1080,
    });
    expect(during.desks.find((d) => d.deskId === desk.id)?.state).toBe("BOOKED");
    expect(during.desks.find((d) => d.deskId === desk.id)?.freeForRequestedSlot).toBe(false);

    const before = await callerFor(user).booking.getFloorAvailability({
      floorId: floor.id,
      date: futureWeekday,
      startMinutes: 420,
      endMinutes: 540,
    });
    expect(before.desks.find((d) => d.deskId === desk.id)?.state).toBe("AVAILABLE");
    expect(before.desks.find((d) => d.deskId === desk.id)?.freeForRequestedSlot).toBe(true);
  });

  it("does not colour a desk on one date because of a booking on another date", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "F4", x: 3, y: 3 } });
    const laterWeekday = nextWeekday(new Date(`${futureWeekday}T12:00:00Z`));
    const userA = await newStandardUser("f4-user-a");
    // User A books "tomorrow" 09:00–18:00 …
    await callerFor(userA).booking.create({ deskId: desk.id, date: laterWeekday, startMinutes: 540, endMinutes: 1080 });

    // … must leave the earlier date free, for the whole day and for a specific slot.
    const wholeDay = await callerFor(user).booking.getFloorAvailability({ floorId: floor.id, date: futureWeekday });
    expect(wholeDay.desks.find((d) => d.deskId === desk.id)?.state).toBe("AVAILABLE");
    expect(wholeDay.desks.find((d) => d.deskId === desk.id)?.bookings).toHaveLength(0);

    const slot = await callerFor(user).booking.getFloorAvailability({
      floorId: floor.id,
      date: futureWeekday,
      startMinutes: 960,
      endMinutes: 1080,
    });
    expect(slot.desks.find((d) => d.deskId === desk.id)?.state).toBe("AVAILABLE");

    // … and User B really can book the earlier date at an overlapping wall-clock time (16:00–18:00).
    const userB = await newStandardUser("f4-user-b");
    const booked = await callerFor(userB).booking.create({ deskId: desk.id, date: futureWeekday, startMinutes: 960, endMinutes: 1080 });
    expect(booked.status).toBe("CONFIRMED");
  });

  it("hides coworker identity when the site disallows it, except from the owner and site admins", async () => {
    const privateSite = await db.site.create({
      data: {
        organizationId: org.id,
        name: "Private Site",
        timeZone: "Europe/London",
        operatingHoursStart: 420,
        operatingHoursEnd: 1080,
        allowEmployeeSeeBookings: false,
      },
    });
    const privateFloor = await db.floor.create({ data: { organizationId: org.id, siteId: privateSite.id, name: "Floor", sortOrder: 0 } });
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: privateFloor.id, number: "P1", x: 0, y: 0 } });
    const owner = await newStandardUser("p1-owner");
    await callerFor(owner).booking.create({ deskId: desk.id, date: futureWeekday, startMinutes: 600, endMinutes: 660 });

    const coworker = await newStandardUser("p1-coworker");
    const adminRow = await db.user.create({
      data: { organizationId: org.id, email: "admin@get-floor-availability.test", name: "Admin", role: Role.SITE_ADMIN },
    });
    await db.permission.create({ data: { organizationId: org.id, userId: adminRow.id, siteId: privateSite.id, type: "FACILITY_ADMIN" } });
    const admin = { id: adminRow.id, name: adminRow.name, email: adminRow.email, role: adminRow.role, organizationId: org.id };

    const seenByCoworker = (await callerFor(coworker).booking.getFloorAvailability({ floorId: privateFloor.id, date: futureWeekday })).desks.find(
      (d) => d.deskId === desk.id,
    )!.bookings[0]!;
    expect(seenByCoworker.occupantLabel).toBe("Booked");
    expect(seenByCoworker.occupant).toBeNull();
    expect(seenByCoworker.canManage).toBe(false);

    const seenByOwner = (await callerFor(owner).booking.getFloorAvailability({ floorId: privateFloor.id, date: futureWeekday })).desks.find(
      (d) => d.deskId === desk.id,
    )!.bookings[0]!;
    expect(seenByOwner.occupant?.name).toBe(owner.name);
    expect(seenByOwner.canManage).toBe(true);

    const seenByAdmin = (await callerFor(admin).booking.getFloorAvailability({ floorId: privateFloor.id, date: futureWeekday })).desks.find(
      (d) => d.deskId === desk.id,
    )!.bookings[0]!;
    expect(seenByAdmin.occupant?.email).toBe(owner.email);
    expect(seenByAdmin.canManage).toBe(true);
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
