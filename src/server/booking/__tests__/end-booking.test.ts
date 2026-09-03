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
    await db.permission.create({ data: { organizationId: org.id, userId: adminRow.id, siteId: site.id } });

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

  it("rejects ending a booking that was never checked in", async () => {
    const desk = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "E2", x: 1, y: 1, requiresCheckIn: true } });
    const booking = await callerFor(user).booking.create({ deskId: desk.id, date: futureWeekday, startMinutes: 660, endMinutes: 720 });

    await expect(callerFor(user).booking.endBooking({ bookingId: booking.id })).rejects.toThrow(/checked-in booking/i);
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
