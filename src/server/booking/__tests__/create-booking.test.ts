import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";

/**
 * Exercises the booking.create/cancel tRPC procedures end-to-end against a
 * real Postgres database (including the GiST exclusion constraints from
 * prisma/migrations/*_booking_overlap_constraints) — CLAUDE.md rules 1
 * (tenant isolation), 2 (no double-booking), 3 (weekday/operating-hours), 4
 * (one active booking per user), 5 (cancel before start only). See
 * overlap-constraints.test.ts for a test of the raw DB constraint itself.
 *
 * Run against DATABASE_URL_TEST — migrations must already be applied there,
 * e.g. `DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy`.
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

function nextWeekend(from: Date): string {
  const date = new Date(from);
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

type SessionUser = { id: string; name: string; email: string; role: Role; organizationId: string | null };

function callerFor(user: SessionUser) {
  return appRouter.createCaller({ db, headers: new Headers(), session: { user } });
}

let orgA: { id: string };
let orgB: { id: string };
let siteA: { id: string; id2?: never };
let floorA: { id: string };
let deskA1: { id: string };
let deskA2: { id: string };
let deskB: { id: string };
let standardUser: SessionUser;
let standardUser2: SessionUser;
let siteAdmin: SessionUser;
let futureWeekday: string;
let pastBookingDeskId: string;

describe("booking.create / booking.cancel", () => {
  beforeAll(async () => {
    await db.booking.deleteMany();
    await db.auditLog.deleteMany();
    await db.permission.deleteMany();
    await db.desk.deleteMany();
    await db.floor.deleteMany();
    await db.site.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany({ where: { slug: { in: ["booking-test-a", "booking-test-b"] } } });

    orgA = await db.organization.create({ data: { name: "Booking Test A", slug: "booking-test-a", ssoGoogleDomains: [] } });
    orgB = await db.organization.create({ data: { name: "Booking Test B", slug: "booking-test-b", ssoGoogleDomains: [] } });

    siteA = await db.site.create({
      data: { organizationId: orgA.id, name: "Site A", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1080 },
    });
    const siteB = await db.site.create({
      data: { organizationId: orgB.id, name: "Site B", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1080 },
    });

    floorA = await db.floor.create({ data: { organizationId: orgA.id, siteId: siteA.id, name: "Floor A", sortOrder: 0 } });
    const floorB = await db.floor.create({ data: { organizationId: orgB.id, siteId: siteB.id, name: "Floor B", sortOrder: 0 } });

    deskA1 = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A1", x: 0, y: 0 } });
    deskA2 = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A2", x: 1, y: 1 } });
    deskB = await db.desk.create({ data: { organizationId: orgB.id, floorId: floorB.id, number: "B1", x: 0, y: 0 } });

    const standardUserRow = await db.user.create({
      data: { organizationId: orgA.id, email: "standard@a.test", name: "Standard User", role: Role.STANDARD_USER },
    });
    const standardUser2Row = await db.user.create({
      data: { organizationId: orgA.id, email: "standard2@a.test", name: "Standard User Two", role: Role.STANDARD_USER },
    });
    const siteAdminRow = await db.user.create({
      data: { organizationId: orgA.id, email: "admin@a.test", name: "Site Admin", role: Role.SITE_ADMIN },
    });
    await db.permission.create({ data: { organizationId: orgA.id, userId: siteAdminRow.id, siteId: siteA.id } });

    standardUser = { id: standardUserRow.id, name: standardUserRow.name, email: standardUserRow.email, role: standardUserRow.role, organizationId: orgA.id };
    standardUser2 = { id: standardUser2Row.id, name: standardUser2Row.name, email: standardUser2Row.email, role: standardUser2Row.role, organizationId: orgA.id };
    siteAdmin = { id: siteAdminRow.id, name: siteAdminRow.name, email: siteAdminRow.email, role: siteAdminRow.role, organizationId: orgA.id };

    futureWeekday = nextWeekday(new Date());

    const pastDesk = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A3", x: 2, y: 2 } });
    pastBookingDeskId = pastDesk.id;
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await db.booking.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await db.permission.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await db.desk.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await db.floor.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await db.site.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await db.user.deleteMany({ where: { organizationId: { in: [orgA.id, orgB.id] } } });
    await db.organization.deleteMany({ where: { id: { in: [orgA.id, orgB.id] } } });
    await db.$disconnect();
  });

  it("creates a booking on the happy path", async () => {
    const booking = await callerFor(standardUser).booking.create({
      deskId: deskA1.id,
      date: futureWeekday,
      startMinutes: 540,
      endMinutes: 600,
    });
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.userId).toBe(standardUser.id);
    expect(booking.organizationId).toBe(orgA.id);
  });

  it("rejects weekend dates", async () => {
    await expect(
      callerFor(standardUser).booking.create({
        deskId: deskA2.id,
        date: nextWeekend(new Date()),
        startMinutes: 540,
        endMinutes: 600,
      }),
    ).rejects.toThrow(/weekday/i);
  });

  it("rejects times outside the site's operating hours", async () => {
    await expect(
      callerFor(standardUser).booking.create({ deskId: deskA2.id, date: futureWeekday, startMinutes: 0, endMinutes: 60 }),
    ).rejects.toThrow(/operating hours/i);
  });

  it("rejects a desk from a different organization (tenant isolation)", async () => {
    await expect(
      callerFor(standardUser).booking.create({ deskId: deskB.id, date: futureWeekday, startMinutes: 540, endMinutes: 600 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a second overlapping booking on the same desk", async () => {
    await callerFor(standardUser2).booking.create({ deskId: deskA2.id, date: futureWeekday, startMinutes: 540, endMinutes: 600 });
    await expect(
      callerFor(siteAdmin).booking.create({
        deskId: deskA2.id,
        date: futureWeekday,
        startMinutes: 570,
        endMinutes: 630,
        guestName: "Overlap Guest",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects a second overlapping booking for the same user on a different desk", async () => {
    // standardUser already holds 09:00-10:00 on deskA1 from the happy-path test.
    const freshDesk = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A4", x: 3, y: 3 } });
    await expect(
      callerFor(standardUser).booking.create({ deskId: freshDesk.id, date: futureWeekday, startMinutes: 570, endMinutes: 630 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets a site admin book on behalf of another user", async () => {
    const freshDesk = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A5", x: 4, y: 4 } });
    const booking = await callerFor(siteAdmin).booking.create({
      deskId: freshDesk.id,
      date: futureWeekday,
      startMinutes: 660,
      endMinutes: 720,
      forUserId: standardUser2.id,
    });
    expect(booking.userId).toBe(standardUser2.id);
    expect(booking.bookedById).toBe(siteAdmin.id);
  });

  it("lets a site admin create a guest booking", async () => {
    const freshDesk = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A6", x: 5, y: 5 } });
    const booking = await callerFor(siteAdmin).booking.create({
      deskId: freshDesk.id,
      date: futureWeekday,
      startMinutes: 660,
      endMinutes: 720,
      guestName: "Visiting Guest",
    });
    expect(booking.userId).toBeNull();
    expect(booking.guestName).toBe("Visiting Guest");
    expect(booking.bookedById).toBe(siteAdmin.id);
  });

  it("forbids a standard user from creating a guest booking", async () => {
    const freshDesk = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A7", x: 6, y: 6 } });
    await expect(
      callerFor(standardUser2).booking.create({
        deskId: freshDesk.id,
        date: futureWeekday,
        startMinutes: 660,
        endMinutes: 720,
        guestName: "Sneaky Guest",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cancels a booking before its start time", async () => {
    const freshDesk = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A8", x: 7, y: 7 } });
    const booking = await callerFor(standardUser2).booking.create({
      deskId: freshDesk.id,
      date: futureWeekday,
      startMinutes: 780,
      endMinutes: 840,
    });
    const cancelled = await callerFor(standardUser2).booking.cancel({ bookingId: booking.id });
    expect(cancelled.status).toBe("CANCELLED");

    await expect(callerFor(standardUser2).booking.cancel({ bookingId: booking.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("forbids a non-owner without admin role from cancelling", async () => {
    const freshDesk = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A9", x: 8, y: 8 } });
    const booking = await callerFor(standardUser2).booking.create({
      deskId: freshDesk.id,
      date: futureWeekday,
      startMinutes: 900,
      endMinutes: 960,
    });
    await expect(
      appRouter.createCaller({ db, headers: new Headers(), session: { user: standardUser } }).booking.cancel({ bookingId: booking.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a site admin with permission cancel someone else's booking", async () => {
    const freshDesk = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorA.id, number: "A10", x: 9, y: 9 } });
    const booking = await callerFor(standardUser2).booking.create({
      deskId: freshDesk.id,
      date: futureWeekday,
      startMinutes: 960,
      endMinutes: 1020,
    });
    const cancelled = await callerFor(siteAdmin).booking.cancel({ bookingId: booking.id });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelledById).toBe(siteAdmin.id);
  });

  it("rejects cancelling a booking that has already started", async () => {
    const start = new Date(Date.now() - 60 * 60 * 1000);
    const end = new Date(Date.now() + 60 * 60 * 1000);
    const started = await db.booking.create({
      data: {
        organizationId: orgA.id,
        deskId: pastBookingDeskId,
        userId: standardUser.id,
        bookedById: standardUser.id,
        date: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
        startAt: start,
        endAt: end,
        status: "CONFIRMED",
      },
    });
    await expect(callerFor(standardUser).booking.cancel({ bookingId: started.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
