import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";

/**
 * Exercises booking.endBooking — releasing a checked-in desk before its
 * scheduled end time. Run against DATABASE_URL_TEST — migrations must
 * already be applied there.
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
let otherUser: SessionUser;
let siteAdmin: SessionUser;
let futureWeekday: string;

describe("booking.endBooking", () => {
  beforeAll(async () => {
    await db.organization.deleteMany({ where: { slug: "end-booking-test" } });

    org = await db.organization.create({ data: { name: "End Booking Test", slug: "end-booking-test", ssoGoogleDomains: [] } });
    site = await db.site.create({
      data: { organizationId: org.id, name: "Site", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1080 },
    });
    floor = await db.floor.create({ data: { organizationId: org.id, siteId: site.id, name: "Floor", sortOrder: 0 } });

    const userRow = await db.user.create({
      data: { organizationId: org.id, email: "standard@end-booking.test", name: "Standard User", role: Role.STANDARD_USER },
    });
    const otherRow = await db.user.create({
      data: { organizationId: org.id, email: "other@end-booking.test", name: "Other User", role: Role.STANDARD_USER },
    });
    const adminRow = await db.user.create({
      data: { organizationId: org.id, email: "admin@end-booking.test", name: "Site Admin", role: Role.SITE_ADMIN },
    });
    await db.permission.create({ data: { organizationId: org.id, userId: adminRow.id, siteId: site.id, type: "FACILITY_ADMIN" } });

    user = { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role, organizationId: org.id };
    otherUser = { id: otherRow.id, name: otherRow.name, email: otherRow.email, role: otherRow.role, organizationId: org.id };
    siteAdmin = { id: adminRow.id, name: adminRow.name, email: adminRow.email, role: adminRow.role, organizationId: org.id };

    futureWeekday = nextWeekday(new Date());
  });

  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { organizationId: org.id } });
    await db.booking.deleteMany({ where: { organizationId: org.id } });
    await db.permission.deleteMany({ where: { organizationId: org.id } });
    await db.desk.deleteMany({ where: { organizationId: org.id } });
    await db.floor.deleteMany({ where: { organizationId: org.id } });
    await db.site.deleteMany({ where: { organizationId: org.id } });
    await db.user.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
  });

  it("ends a checked-in booking early and frees the desk", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "E1", x: 0, y: 0, requiresCheckIn: true } });
    const booking = await callerFor(user).booking.create({ deskId: desk.id, date: futureWeekday, startMinutes: 540, endMinutes: 600 });
    await callerFor(user).booking.checkIn({ bookingId: booking.id });

    const completed = await callerFor(user).booking.endBooking({ bookingId: booking.id });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.endAt).toEqual(booking.endAt);

    const availability = await callerFor(user).booking.getFloorAvailability({ floorId: floor.id, date: futureWeekday });
    expect(availability.desks.find((d) => d.deskId === desk.id)?.state).toBe("AVAILABLE");
  });

  it("rejects ending a confirmed booking that hasn't started yet", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "E2", x: 1, y: 1, requiresCheckIn: true } });
    const booking = await callerFor(user).booking.create({ deskId: desk.id, date: futureWeekday, startMinutes: 660, endMinutes: 720 });

    await expect(callerFor(user).booking.endBooking({ bookingId: booking.id })).rejects.toThrow(/hasn't started yet/i);
  });

  async function createInProgressBooking(deskNumber: string, occupant: SessionUser) {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: deskNumber, x: 5, y: 5 } });
    const booking = await db.booking.create({
      data: {
        organizationId: org.id,
        deskId: desk.id,
        userId: occupant.id,
        bookedById: occupant.id,
        date: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
        startAt: new Date(Date.now() - 60 * 60 * 1000),
        endAt: new Date(Date.now() + 60 * 60 * 1000),
        status: "CONFIRMED",
      },
    });
    return { desk, booking };
  }

  it("lets the owner end a confirmed booking that is in progress", async () => {
    const { booking } = await createInProgressBooking("E5", user);
    const completed = await callerFor(user).booking.endBooking({ bookingId: booking.id });
    expect(completed.status).toBe("COMPLETED");
  });

  it("lets a site admin end another user's in-progress booking, freeing the desk right now", async () => {
    const { desk, booking } = await createInProgressBooking("E6", user);
    const today = new Date().toISOString().slice(0, 10);

    const completed = await callerFor(siteAdmin).booking.endBooking({ bookingId: booking.id });
    expect(completed.status).toBe("COMPLETED");

    const availability = await callerFor(otherUser).booking.getFloorAvailability({ floorId: floor.id, date: today });
    expect(availability.desks.find((d) => d.deskId === desk.id)?.state).toBe("AVAILABLE");

    const audit = await db.auditLog.findFirst({ where: { targetId: booking.id, action: "booking.endEarly" } });
    expect(audit?.actorId).toBe(siteAdmin.id);
  });

  it("forbids a standard user from ending another user's in-progress booking", async () => {
    const { booking } = await createInProgressBooking("E7", user);
    await expect(callerFor(otherUser).booking.endBooking({ bookingId: booking.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.booking.findUnique({ where: { id: booking.id } }))?.status).toBe("CONFIRMED");
  });

  it("forbids a facility admin of a different site from ending the booking", async () => {
    const outsiderRow = await db.user.create({
      data: { organizationId: org.id, email: "other-site-admin@end-booking.test", name: "Other Site Admin", role: Role.SITE_ADMIN },
    });
    const outsider = { id: outsiderRow.id, name: outsiderRow.name, email: outsiderRow.email, role: outsiderRow.role, organizationId: org.id };
    // otherUser as occupant: `user` still holds the (untouched) in-progress booking from the previous test.
    const { booking } = await createInProgressBooking("E8", otherUser);
    await expect(callerFor(outsider).booking.endBooking({ bookingId: booking.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("forbids a non-owner without admin role from ending a booking", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "E3", x: 2, y: 2, requiresCheckIn: true } });
    const booking = await callerFor(user).booking.create({ deskId: desk.id, date: futureWeekday, startMinutes: 780, endMinutes: 840 });
    await callerFor(user).booking.checkIn({ bookingId: booking.id });

    await expect(callerFor(otherUser).booking.endBooking({ bookingId: booking.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets a site admin with permission end someone else's booking", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "E4", x: 3, y: 3, requiresCheckIn: true } });
    const booking = await callerFor(user).booking.create({ deskId: desk.id, date: futureWeekday, startMinutes: 900, endMinutes: 960 });
    await callerFor(user).booking.checkIn({ bookingId: booking.id });

    const completed = await callerFor(siteAdmin).booking.endBooking({ bookingId: booking.id });
    expect(completed.status).toBe("COMPLETED");
  });
});
