import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";

/**
 * Global search (desks by number/name, people by name/email) and the person
 * card with current/next booking, including the coworker-visibility policy.
 * Run against DATABASE_URL_TEST — migrations must already be applied there.
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string | null;
};

function callerFor(user: SessionUser) {
  return appRouter.createCaller({ db, headers: new Headers(), session: { user } });
}

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10) + "T00:00:00Z");

let org: { id: string };
let otherOrg: { id: string };
let openSite: { id: string };
let privateSite: { id: string };
let openFloor: { id: string };
let privateFloor: { id: string };
let openDesk: { id: string };
let privateDesk: { id: string };
let riley: SessionUser;
let jordan: SessionUser;
let admin: SessionUser;

describe("search", () => {
  beforeAll(async () => {
    await db.organization.deleteMany({
      where: { slug: { in: ["search-test", "search-test-other"] } },
    });
    org = await db.organization.create({
      data: { name: "Search Test", slug: "search-test" },
    });
    otherOrg = await db.organization.create({
      data: { name: "Search Test Other", slug: "search-test-other" },
    });

    openSite = await db.site.create({
      data: {
        organizationId: org.id,
        name: "Open Site",
        timeZone: "Europe/London",
        operatingHoursStart: 0,
        operatingHoursEnd: 1440,
      },
    });
    privateSite = await db.site.create({
      data: {
        organizationId: org.id,
        name: "Private Site",
        timeZone: "Europe/London",
        operatingHoursStart: 0,
        operatingHoursEnd: 1440,
        allowEmployeeSeeBookings: false,
      },
    });
    openFloor = await db.floor.create({
      data: { organizationId: org.id, siteId: openSite.id, name: "Level 2", sortOrder: 0 },
    });
    privateFloor = await db.floor.create({
      data: { organizationId: org.id, siteId: privateSite.id, name: "Level 1", sortOrder: 0 },
    });
    openDesk = await db.desk.create({
      data: {
        organizationId: org.id,
        floorId: openFloor.id,
        number: "2.10",
        name: "Window desk",
        x: 1,
        y: 1,
      },
    });
    privateDesk = await db.desk.create({
      data: { organizationId: org.id, floorId: privateFloor.id, number: "1.05", x: 1, y: 1 },
    });
    await db.desk.create({
      data: {
        organizationId: org.id,
        floorId: openFloor.id,
        number: "2.11",
        x: 2,
        y: 2,
        archivedAt: new Date(),
      },
    });

    const otherSite = await db.site.create({
      data: {
        organizationId: otherOrg.id,
        name: "Other",
        timeZone: "Europe/London",
        operatingHoursStart: 0,
        operatingHoursEnd: 1440,
      },
    });
    const otherFloor = await db.floor.create({
      data: {
        organizationId: otherOrg.id,
        siteId: otherSite.id,
        name: "Other Floor",
        sortOrder: 0,
      },
    });
    await db.desk.create({
      data: { organizationId: otherOrg.id, floorId: otherFloor.id, number: "2.10", x: 1, y: 1 },
    });
    await db.user.create({
      data: {
        organizationId: otherOrg.id,
        email: "riley@other.test",
        name: "Riley Otherorg",
        role: Role.STANDARD_USER,
      },
    });

    const mk = async (
      email: string,
      name: string,
      role: Role,
      extra: { department?: string; title?: string } = {},
    ) => {
      const row = await db.user.create({
        data: { organizationId: org.id, email, name, role, ...extra },
      });
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        organizationId: org.id,
      };
    };
    riley = await mk("riley@search.test", "Riley Employee", Role.STANDARD_USER, {
      department: "Engineering",
      title: "Engineer",
    });
    jordan = await mk("jordan@search.test", "Jordan Employee", Role.STANDARD_USER);
    admin = await mk("admin@search.test", "Sam Admin", Role.ORG_SUPER_ADMIN);
    await db.user.create({
      data: {
        organizationId: org.id,
        email: "gone@search.test",
        name: "Riley Former",
        role: Role.STANDARD_USER,
        isActive: false,
      },
    });

    // Riley: in progress now on the open desk, next one tomorrow on the private desk.
    await db.booking.create({
      data: {
        organizationId: org.id,
        deskId: openDesk.id,
        userId: riley.id,
        bookedById: riley.id,
        date: dateOnly(new Date()),
        startAt: hoursFromNow(-1),
        endAt: hoursFromNow(1),
        status: "CONFIRMED",
      },
    });
    await db.booking.create({
      data: {
        organizationId: org.id,
        deskId: privateDesk.id,
        userId: riley.id,
        bookedById: riley.id,
        date: dateOnly(hoursFromNow(26)),
        startAt: hoursFromNow(26),
        endAt: hoursFromNow(28),
        status: "CONFIRMED",
      },
    });
  });

  afterAll(async () => {
    for (const o of [org, otherOrg]) {
      await db.booking.deleteMany({ where: { organizationId: o.id } });
      await db.desk.deleteMany({ where: { organizationId: o.id } });
      await db.floor.deleteMany({ where: { organizationId: o.id } });
      await db.site.deleteMany({ where: { organizationId: o.id } });
      await db.user.deleteMany({ where: { organizationId: o.id } });
      await db.organization.delete({ where: { id: o.id } });
    }
    await db.$disconnect();
  });

  it("finds desks by number or name, across sites, within the org, excluding archived desks", async () => {
    const byNumber = await callerFor(jordan).search.global({ query: "2.1" });
    expect(byNumber.desks.map((d) => d.number)).toEqual(["2.10"]);
    expect(byNumber.desks[0]?.floor.site.name).toBe("Open Site");

    const byName = await callerFor(jordan).search.global({ query: "window" });
    expect(byName.desks.map((d) => d.id)).toEqual([openDesk.id]);
  });

  it("finds active people by name or email for any signed-in user", async () => {
    const result = await callerFor(jordan).search.global({ query: "ril" });
    expect(result.people.map((p) => p.email)).toEqual(["riley@search.test"]);
    expect(result.people[0]).toMatchObject({ department: "Engineering", title: "Engineer" });

    const byEmail = await callerFor(jordan).search.global({ query: "jordan@" });
    expect(byEmail.people.map((p) => p.id)).toEqual([jordan.id]);
  });

  it("shows a colleague's details with their current booking, hiding bookings at sites that keep them private", async () => {
    const card = await callerFor(jordan).search.person({ userId: riley.id });
    expect(card.person).toMatchObject({
      name: "Riley Employee",
      email: "riley@search.test",
      department: "Engineering",
      title: "Engineer",
    });
    expect(card.currentBooking?.desk.number).toBe("2.10");
    expect(card.currentBooking?.floor.id).toBe(openFloor.id);
    expect(card.currentBooking?.site.id).toBe(openSite.id);
    // Tomorrow's booking is at the private site → withheld from a coworker.
    expect(card.nextBooking).toBeNull();
    expect(card.hiddenByPolicy).toBe(true);
  });

  it("shows every booking to the person themselves and to an admin", async () => {
    const own = await callerFor(riley).search.person({ userId: riley.id });
    expect(own.nextBooking?.desk.number).toBe("1.05");
    expect(own.hiddenByPolicy).toBe(false);

    const seenByAdmin = await callerFor(admin).search.person({ userId: riley.id });
    expect(seenByAdmin.currentBooking?.desk.number).toBe("2.10");
    expect(seenByAdmin.nextBooking?.desk.number).toBe("1.05");
  });

  it("returns only the details for someone with no bookings, and 404s for another organization's user", async () => {
    const card = await callerFor(riley).search.person({ userId: jordan.id });
    expect(card.person.name).toBe("Jordan Employee");
    expect(card.currentBooking).toBeNull();
    expect(card.nextBooking).toBeNull();

    const outsider = await db.user.findFirstOrThrow({ where: { organizationId: otherOrg.id } });
    await expect(callerFor(riley).search.person({ userId: outsider.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
